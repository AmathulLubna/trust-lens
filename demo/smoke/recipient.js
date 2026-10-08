async (page) => {
  const tag=await page.addScriptTag({path:'D:/trust-lens-main/.checkpoints/live-demo-test-bootstrap.js'});
  const credentials=await page.evaluate(()=>{const value=globalThis.__trustlensTestCredentials;delete globalThis.__trustlensTestCredentials;return value;});
  await tag.evaluate(element=>element.remove());
  const caller=page.context().pages()[0];
  await page.getByLabel('Role',{exact:true}).selectOption('recipient');
  await page.getByLabel('Personal demo credential').fill(credentials.recipient);
  await page.getByLabel('Consented audio file',{exact:true}).setInputFiles('output/playwright/live-fixtures/recipient-only-warning.wav');
  await page.getByLabel('Session ID',{exact:true}).fill(await caller.getByLabel('Session ID',{exact:true}).inputValue());
  await page.getByLabel('Recipient invite',{exact:true}).fill(await caller.getByLabel('Recipient invite',{exact:true}).inputValue());
  await page.getByRole('checkbox').check();
  await page.evaluate(()=>{globalThis.__trustlensSmoke={responses:[]};});
  if(page.__trustlensResponseListener)page.off('response',page.__trustlensResponseListener);
  page.__trustlensResponseListener=async response=>{
    if(response.url().includes('/segments')&&response.ok()){
      const body=await response.json();
      await page.evaluate(value=>globalThis.__trustlensSmoke.responses.push(value),body).catch(()=>{});
    }
  };
  page.on('response',page.__trustlensResponseListener);
  await page.getByRole('button',{name:'Join call',exact:true}).click();
  await page.getByText('Track separation and measured latency',{exact:true}).click();
  await page.getByRole('button',{name:'Export measured session metadata'}).waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Export measured session metadata').disabled,{},{timeout:45000});
  const findings=await page.getByRole('heading',{name:'Conversation warnings',exact:true}).locator('..').textContent();
  if(findings.includes('otp credential'))throw new Error('Recipient microphone/file leaked into remote caller analysis');
}
