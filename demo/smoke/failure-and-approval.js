async (page) => {
  const recipient=page.context().pages()[1];
  const tag=await page.addScriptTag({path:'C:/Users/Admin/.codex/trustlens-live-demo-test-bootstrap.js'});
  const credentials=await page.evaluate(()=>{const value=globalThis.__trustlensTestCredentials;delete globalThis.__trustlensTestCredentials;return value;});
  await tag.evaluate(element=>element.remove());
  await page.getByLabel('Personal demo credential').fill(credentials.verifier);
  await page.getByLabel('Session ID',{exact:true}).fill(await recipient.getByLabel('Session ID',{exact:true}).inputValue());
  await page.getByRole('button',{name:'Inject one analysis failure (operator test)',exact:true}).click();
  await recipient.getByRole('cell',{name:'analysis_failure',exact:true}).waitFor({timeout:30000});
  const download=recipient.waitForEvent('download');await recipient.getByRole('button',{name:'Export measured session metadata'}).click();
  await (await download).saveAs('D:/trust-lens-main/output/playwright/live-failure.json');
  await recipient.getByRole('button',{name:'Request independent confirmation',exact:true}).click();
  await recipient.waitForFunction(()=>document.querySelector('[aria-label="Approval ID"]').value.length>0);
  await page.getByLabel('Approval ID',{exact:true}).fill(await recipient.getByLabel('Approval ID',{exact:true}).inputValue());
  await page.getByRole('button',{name:'Review exact request',exact:true}).click();
  await page.getByLabel('Approval details',{exact:true}).waitFor();
  // Automated attestation tests credential/receipt flow only. No actual
  // independent callback or financial approval is claimed by this smoke test.
  await page.getByRole('checkbox',{name:'I independently confirmed these exact details through the authenticated approval portal.'}).check();
  await page.getByRole('button',{name:'Issue simulation receipt',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Confirmation receipt"]').value.length>0);
  await recipient.getByLabel('Confirmation receipt',{exact:true}).fill(await page.getByLabel('Confirmation receipt',{exact:true}).inputValue());
  await recipient.getByRole('button',{name:'Complete simulated approval',exact:true}).click();
  await recipient.getByRole('status').filter({hasText:'Simulation completed. No funds transferred.'}).waitFor({timeout:10000});
  const finalDownload=recipient.waitForEvent('download');await recipient.getByRole('button',{name:'Export measured session metadata'}).click();
  await (await finalDownload).saveAs('D:/trust-lens-main/output/playwright/live-all-scenarios.json');
}
