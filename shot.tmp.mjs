import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport:{width:1280,height:900}, deviceScaleFactor:1 });
await ctx.addInitScript(()=>{try{localStorage.setItem("upside-look-around","1");localStorage.setItem("upside-analytics-consent","no");}catch{}});
const p = await ctx.newPage();
p.on("pageerror",e=>console.log("PAGEERR "+e.message.slice(0,200)));
await p.goto("http://localhost:3000"+process.argv[2],{waitUntil:"domcontentloaded",timeout:90000});
await p.waitForTimeout(12000);
const info = await p.evaluate(()=>{
  const t=document.body.innerText;
  const i=t.indexOf("Covered call");
  return {has:i>=0, near: i>=0? t.slice(i,i+260):"(no covered call panel)",
    overflow: document.documentElement.scrollWidth>document.documentElement.clientWidth};
});
console.log(JSON.stringify(info,null,1));
const tips = await p.$$eval('button[aria-label^="What"]', els=>els.map(e=>({l:e.getAttribute("aria-label"),t:e.innerText})).slice(0,14));
console.log(JSON.stringify(tips,null,1));
await b.close();
