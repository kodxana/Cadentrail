class StudioMeter extends AudioWorkletProcessor {
  constructor(){super();this.count=0;this.sum=[0,0];this.peak=[0,0];this.cross=0;this.enabled=true;this.port.onmessage=e=>{if(e.data==='close')this.enabled=false};}
  process(inputs,outputs){
    if(!this.enabled)return false;
    const input=inputs[0],output=outputs[0];
    if(!input?.[0])return true;
    for(let ch=0;ch<output.length;ch++)output[ch].set(input[ch]??input[0]);
    const left=input[0],right=input[1]??left;
    for(let i=0;i<left.length;i++){this.peak[0]=Math.max(this.peak[0],Math.abs(left[i]));this.peak[1]=Math.max(this.peak[1],Math.abs(right[i]));this.sum[0]+=left[i]*left[i];this.sum[1]+=right[i]*right[i];this.cross+=left[i]*right[i];}
    this.count+=left.length;
    if(this.count>=sampleRate/20){const stereo=[];for(let i=0;i<left.length;i+=2)stereo.push([left[i],right[i]]);this.port.postMessage({peak:this.peak,rms:this.sum.map(x=>Math.sqrt(x/this.count)),correlation:this.cross/Math.max(1e-12,Math.sqrt(this.sum[0]*this.sum[1])),stereo});this.count=0;this.sum=[0,0];this.peak=[0,0];this.cross=0;}
    return true;
  }
}
registerProcessor('studio-meter',StudioMeter);
