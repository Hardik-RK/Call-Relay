function oklch(L,C,h,a=1){const r=h*Math.PI/180,A=C*Math.cos(r),B=C*Math.sin(r);
const l=(L+0.3963377774*A+0.2158037573*B)**3,m=(L-0.1055613458*A-0.0638541728*B)**3,s=(L-0.0894841775*A-1.291485548*B)**3;
let rgb=[4.0767416621*l-3.3077115913*m+0.2309699292*s,-1.2684380046*l+2.6097574011*m-0.3413193965*s,-0.0041960863*l-0.7034186147*m+1.707614701*s];
const g=x=>{x=Math.min(1,Math.max(0,x));return x<=0.0031308?12.92*x:1.055*x**(1/2.4)-0.055};
const b=rgb.map(x=>Math.round(g(x)*255));return 'Color(0x'+[Math.round(a*255),...b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase()+')';}
const T={
light:{base:[.962,.003,260],panel:[.997,.001,260],inset:[.967,.003,260],raised:[.998,.001,260],fg:[.19,.01,260],muted:[.45,.008,260],faint:[.6,.006,260],line:[.25,.01,260,.09],lineStrong:[.25,.01,260,.16],primary:[.52,.15,252],primaryPress:[.47,.15,252],onPrimary:[.99,.003,252],accentText:[.49,.15,252],accentSoft:[.52,.15,252,.08],success:[.56,.14,155],successText:[.42,.11,155],warning:[.74,.15,70],warningText:[.5,.12,60],hover:[.25,.01,260,.045],ledOff:[.3,.015,260,.13],danger:[.5,.19,25],dangerText:[.46,.18,25]},
dark:{base:[.15,.004,270],panel:[.178,.004,270],inset:[.137,.003,270],raised:[.215,.004,270],fg:[.94,0,0],muted:[.71,.004,270],faint:[.56,.004,270],line:[1,0,0,.065],lineStrong:[1,0,0,.11],primary:[.54,.12,252],primaryPress:[.59,.12,252],onPrimary:[.99,0,0],accentText:[.78,.09,250],accentSoft:[.78,.09,250,.1],success:[.72,.12,155],successText:[.8,.1,155],warning:[.8,.12,78],warningText:[.85,.1,80],hover:[1,0,0,.035],ledOff:[1,0,0,.08],danger:[.7,.17,25],dangerText:[.78,.13,25]}};
for(const k in T){console.log('// '+k);for(const n in T[k]){const v=T[k][n];console.log(`    val ${n} = ${oklch(v[0],v[1],v[2],v[3]??1)}`)}}
