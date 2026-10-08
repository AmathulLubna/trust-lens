async (page) => {
  const tag = await page.addScriptTag({path:'C:/Users/Admin/.codex/trustlens-live-demo-test-bootstrap.js'});
  const credentials = await page.evaluate(()=>{const value=globalThis.__trustlensTestCredentials;delete globalThis.__trustlensTestCredentials;return value;});
  await tag.evaluate(element=>element.remove());
  await page.getByLabel('Personal demo credential').fill(credentials.caller);
  await page.getByLabel('Consented audio file', {exact:true}).setInputFiles('output/playwright/live-fixtures/benign.wav');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', {name:'Check / warm analysis'}).click();
  await page.getByRole('status').filter({hasText:'acoustic loaded, transcription loaded'}).waitFor({timeout:65000});
  await page.getByRole('button', {name:'Create call',exact:true}).click();
  await page.getByRole('button', {name:'End and delete session'}).waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('[aria-label="Session ID"]').value.length>0);
  console.log('Real acoustic + ASR workers loaded; caller created. No credentials printed.');
}
