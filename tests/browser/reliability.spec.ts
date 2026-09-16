import {test,expect,type Page} from "@playwright/test";
const password="cadentrail-browser-test";
async function setup(page:Page,name:string){
 await page.addInitScript(()=>{localStorage.setItem("cadentrail:profile",JSON.stringify({name:"",welcomed:true}));localStorage.setItem("studio:experience","create");});
 expect((await page.request.post("/api/auth",{data:{password}})).ok()).toBeTruthy();
 const project=await (await page.request.post("/api/projects",{data:{name}})).json();
 await page.goto("/#"+project.id);
 await expect(page.getByRole("textbox",{name:"Project name",exact:true})).toHaveValue(name);
 return project;
}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}
for(const width of [1440,390])test(`draft recovery and reconnect at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:900});
 const p=await setup(page,"Recovery "+width);
 await page.route("**/api/projects/"+p.id,route=>route.request().method()==="PUT"?route.abort():route.continue());
 await page.getByRole("textbox",{name:"Project name",exact:true}).fill("Unsaved "+width);
 await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith("cadentrail:recovery:")))).toBeTruthy();
 await page.reload();
 await expect(page.getByRole("heading",{name:"Recover your unsaved work"})).toBeVisible();
 await noOverflow(page);
 await page.screenshot({path:`.runtime/recovery-${width}.png`});
 await page.unroute("**/api/projects/"+p.id);
 await page.getByRole("button",{name:"Restore edits",exact:true}).click();
 await expect.poll(async()=> (await (await page.request.get("/api/projects/"+p.id)).json()).name).toBe("Unsaved "+width);
 await page.request.post("/api/_test/expire");
 await expect(page.getByRole("heading",{name:"Sign back in",exact:true})).toBeVisible();
 await page.getByLabel("Workstation password",{exact:true}).fill(password);
 await page.getByRole("button",{name:"Reconnect",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Sign back in",exact:true})).toBeHidden();
 await expect(page.getByRole("textbox",{name:"Project name",exact:true})).toHaveValue("Unsaved "+width);
});
for(const width of [1440,390])test(`model consent cancellation and verified backup at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:900});
 const p=await setup(page,"Maintenance "+width);
 const jobs=await (await page.request.get("/api/jobs")).json();
 await page.getByRole("button",{name:"Workstation tools",exact:true}).click();
 await page.getByRole("button",{name:"Models",exact:true}).click();
 await expect(page.getByText("Included models stay with the image.",{exact:false})).toBeVisible();
 await noOverflow(page);
 await page.screenshot({path:`.runtime/models-${width}.png`});
 await page.getByRole("button",{name:"Download",exact:true}).first().click();
 await expect(page.getByRole("button",{name:"Download and continue"})).toBeVisible();
 await page.getByRole("button",{name:"Cancel model download",exact:true}).click();
 await expect(page.getByRole("button",{name:"Download and continue"})).toBeHidden();
 expect((await (await page.request.get("/api/jobs")).json()).length).toBe(jobs.length);
 await page.getByRole("button",{name:"Backups",exact:true}).click();
 await page.getByRole("button",{name:"Prepare selected backup",exact:true}).click();
 await expect(page.getByRole("link",{name:"Download verified backup"})).toBeVisible({timeout:30000});
 await expect.poll(async()=> (await (await page.request.get("/api/backups")).json()).last?.projects.some((r:any)=>r.projectId===p.id),{timeout:30000}).toBeTruthy();
 const meta=await (await page.request.get("/api/backups")).json();
 expect(meta.last.projects.some((r:any)=>r.projectId===p.id)).toBeTruthy();
 expect(meta.last.verified).toBe(true);
 const downloaded=await page.request.get("/api/exports/"+meta.last.filename);
 expect(downloaded.ok()).toBeTruthy();
 await page.screenshot({path:`.runtime/backups-${width}.png`});
 await noOverflow(page);
});

for(const width of [1440,390])test(`export compatibility and conflict choices at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:900});
 const p=await setup(page,"Conflict "+width);
 await page.route("**/api/projects/"+p.id,route=>route.request().method()==="PUT"?route.abort():route.continue());
 await page.getByRole("textbox",{name:"Project name",exact:true}).fill("My local title");
 p.name="Title from another tab";
 p.tracks[0].clips[0].notes=[{id:"qa-note",pitch:60,beat:0,duration:4,velocity:96}];
 const write=await page.request.put("/api/projects/"+p.id,{data:p});
 expect(write.ok(),await write.text()).toBeTruthy();
 await page.reload();
 await expect(page.getByRole("heading",{name:"Recover your unsaved work"})).toBeVisible();
 await page.getByRole("radio",{name:/Saved on workstation/}).check();
 await page.screenshot({path:`.runtime/conflict-${width}.png`});
 await page.unroute("**/api/projects/"+p.id);
 await page.getByRole("button",{name:"Apply selected changes"}).click();
 await expect(page.getByRole("textbox",{name:"Project name",exact:true})).toHaveValue("Title from another tab");
 await page.locator(".export-button").click();
 await page.getByRole("combobox",{name:"Render with",exact:true}).selectOption("server");
 await expect(page.getByText("Instrument notes require browser export.",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Queue server export"})).toBeDisabled();
 await page.getByRole("combobox",{name:"Render with",exact:true}).selectOption("browser");
 await expect(page.getByRole("button",{name:"Render and download"})).toBeEnabled();
 await page.getByRole("spinbutton",{name:"Effect tail · seconds",exact:true}).fill("31");
 await expect(page.getByRole("button",{name:"Render and download"})).toBeDisabled();
 await page.screenshot({path:`.runtime/export-${width}.png`});
 await noOverflow(page);
});

test.afterEach(async ({page})=>{await page.request.post("/api/_test/reset-signin");});
