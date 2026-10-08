async (page) => {
  await page.waitForFunction(()=>globalThis.__trustlensSmoke.responses.length>=3,{},{timeout:45000});
  const warnings=await page.getByRole('heading',{name:'Conversation warnings',exact:true}).locator('..').textContent();
  if(warnings.includes('otp credential'))throw new Error('Local recipient content crossed the track boundary');
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export measured session metadata'}).click();
  await (await download).saveAs('D:/trust-lens-main/output/playwright/live-benign.json');
}
