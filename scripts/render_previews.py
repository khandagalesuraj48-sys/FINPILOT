"""Produce reference previews using the exact shipped CSS. They are static and not a running Next.js app."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
css=(root/'app/globals.css').read_text()
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-gpu'])
    for name,origin,width,height in [('desktop','index.html',1440,1080),('mobile','index.html',390,844),('receipt_form','transaction.html',1200,1100)]:
        html=(root/'preview'/origin).read_text().replace('<link rel="stylesheet" href="../app/globals.css">','<style>'+css+'</style>')
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        page.set_content(html, wait_until='load',timeout=30000)
        dest=root.parent/f'FINPILOT_AI_UI_{name}.png'
        page.screenshot(path=str(dest),full_page=(name!='receipt_form'))
        print('Rendered',dest,'width',page.evaluate('document.documentElement.scrollWidth'))
        page.close()
    browser.close()
