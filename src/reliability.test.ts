import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {persistDraft,recoveryDrafts,recoveryWorkspace} from "./recovery";
import {mergeChanges} from "./merge";
import {api} from "./api";
import {downloadPrompt} from "./modelDownloads";
import {exportCapabilities} from "./exportCapabilities";
import {newTrack,newClip,newNote,type Project} from "./model";
let storage:Map<string,string>;
beforeEach(()=>{storage=new Map();vi.stubGlobal("localStorage",{get length(){return storage.size;},key:(i:number)=>[...storage.keys()][i],getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});});
afterEach(()=>vi.unstubAllGlobals());
const project=()=>({id:"a".repeat(32),revision:1,name:"Song",sections:[],tempo:120,loopStart:0,loopEnd:16,tracks:[newTrack({clips:[newClip({duration:16})]})]} as unknown as Project);
it("recovery survives module reload, remains scoped to its workstation, and reports quota errors",async()=>{
 const p=project();recoveryWorkspace("pod-one");expect(persistDraft({...p,name:"Unsaved"},p)).toBeNull();
 vi.resetModules();const fresh=await import("./recovery");fresh.recoveryWorkspace("pod-one");expect(fresh.recoveryDrafts(p.id)[0].project.name).toBe("Unsaved");
 fresh.recoveryWorkspace("pod-two");expect(fresh.recoveryDrafts(p.id)).toEqual([]);
 vi.stubGlobal("localStorage",{setItem:()=>{throw new Error("quota");}});expect(fresh.persistDraft(p,p)).toContain("full or unavailable");
});
it("explicit conflict choices retain unrelated worker additions",()=>{
 const base={name:"old",tracks:[{id:"one",volume:1}]};const local={name:"local",tracks:[{id:"one",volume:.5}]};const remote={name:"remote",tracks:[{id:"one",volume:1},{id:"two",volume:1}]};
 const paths:string[]=[];const merged=mergeChanges(base,local,remote,"project",(path,_b,_l,r)=>{paths.push(path);return r;});
 expect(paths).toEqual(["project.name"]);expect(merged.name).toBe("remote");expect(merged.tracks).toEqual([{id:"one",volume:.5},{id:"two",volume:1}]);
});
it("a dropped enqueue reply is replayed with the same identity and later intentional generation gets a new one",async()=>{
 const keys:string[]=[];const fetch=vi.fn((_url:string,init:RequestInit)=>{keys.push(new Headers(init.headers).get("Idempotency-Key")!);if(keys.length===1)return Promise.reject(new TypeError("network"));return Promise.resolve(new Response(JSON.stringify({id:"job"})));});vi.stubGlobal("fetch",fetch);
 const options={method:"POST",body:JSON.stringify({projectId:"p",kind:"generate"})};await api("/jobs",options);expect(keys[0]).toBe(keys[1]);await api("/jobs",options);expect(keys[2]).not.toBe(keys[1]);
});
it("download consent retains the original job identity",async()=>{
 const keys:string[]=[];vi.stubGlobal("fetch",vi.fn((_url:string,init:RequestInit)=>{keys.push(new Headers(init.headers).get("Idempotency-Key")!);return Promise.resolve(keys.length===1?new Response(JSON.stringify({detail:{code:"model_download_required",models:[{id:"art",name:"Artwork",bytes:1,missingBytes:1}],downloadBytes:1,freeBytes:100}}),{status:428}):new Response(JSON.stringify({id:"job"})));}));
 const pending=api("/jobs",{method:"POST",body:JSON.stringify({projectId:"p",kind:"artwork"})});await vi.waitFor(()=>expect(downloadPrompt.snapshot()).toBeTruthy());downloadPrompt.answer(true);await pending;expect(keys[0]).toBe(keys[1]);
});
it("export preflight accounts for instrument routing and effect tails",()=>{
 const p=project();p.tracks[0].clips[0].notes=[newNote()];p.tracks[0].effects=[{id:"f",type:"reverb",bypass:false,params:{}}];
 expect(exportCapabilities(p).server.join(" ")).toContain("Instrument notes");expect(exportCapabilities(p).server.join(" ")).toContain("reverb");expect(exportCapabilities(p,false,10).totalDuration).toBe(18);
 expect(exportCapabilities(p,false,NaN).browser.length).toBeGreaterThan(0);
});
