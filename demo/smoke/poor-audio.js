async (page) => {
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export measured session metadata'}).click();
  await (await download).saveAs('D:/trust-lens-main/output/playwright/live-suspicious-parallel.json');
  const previous=await page.evaluate(()=>Math.max(...globalThis.__trustlensSmoke.responses.map(r=>r.segment.sequence)));
  const caller=page.context().pages()[0];
  await caller.getByRole('button',{name:'Mute outgoing audio (poor-audio test)',exact:true}).click();
  await page.waitForFunction(sequence=>new Set(globalThis.__trustlensSmoke.responses.filter(r=>r.segment.sequence>sequence&&r.segment.result?.acoustic.status==='insufficient_audio').map(r=>r.segment.sequence)).size>=2,previous,{timeout:45000});
  const warnings=await page.getByRole('heading',{name:'Conversation warnings',exact:true}).locator('..').textContent();
  if(!warnings.includes('payment request'))throw new Error('Silence cleared the existing contextual warning');
  const poorDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export measured session metadata'}).click();
  await (await poorDownload).saveAs('D:/trust-lens-main/output/playwright/live-poor-audio.json');
}
