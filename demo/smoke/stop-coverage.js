async (page) => {
  await page.waitForFunction(()=>new Set(globalThis.__trustlensSmoke.responses.map(r=>r.segment.sequence)).size>=4,{},{timeout:45000});
  await page.getByRole('button',{name:'End and delete session',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Call ended.'}).waitFor();
  await page.getByRole('cell',{name:'capture_stopped',exact:true}).first().waitFor();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export measured session metadata'}).click();
  await (await download).saveAs('D:/trust-lens-main/output/playwright/live-final-stop-coverage.json');
}
