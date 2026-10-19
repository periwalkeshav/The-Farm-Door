"""Generate the social preview image and Apple touch icon for the coming-soon page.

Reuses the door illustration and styles from ../coming-soon/index.html so the
images always match the page. Renders with headless Google Chrome.

Usage:  python3 coming-soon-assets/build_images.py
"""
import pathlib
import re
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
SITE = HERE.parent / "coming-soon"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

page = (SITE / "index.html").read_text()
style = re.search(r"<style>(.*?)</style>", page, re.S).group(1)
stage = re.search(r'(<div class="stage">.*?)\s*</section>', page, re.S).group(1)
fonts = re.search(r'<link href="https://fonts\.googleapis\.com/css2[^>]+>', page).group(0)

STATIC = """
  *, *::before, *::after { animation: none !important; }
  .door-left  { transform: rotateY(80deg);  filter: brightness(.74); }
  .door-right { transform: rotateY(-80deg); filter: brightness(.74); }
  body::before { position: absolute; }
"""

OG = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">{fonts}
<style>{style}{STATIC}
  html, body {{ width: 1200px; height: 630px; overflow: hidden; }}
  .og {{ position: relative; width: 1200px; height: 630px; display: grid;
        grid-template-columns: 560px 1fr; align-items: center; padding-left: 80px; }}
  .og .brand svg {{ width: 44px; height: 44px; }}
  .og .brand span {{ font-size: 28px; }}
  .og .brand {{ display: flex; width: fit-content; }}
  .og .pill {{ display: flex; width: fit-content; margin-top: 40px; font-size: 14px; }}
  .og h1 {{ font-size: 62px; margin: 22px 0 18px; }}
  .og .sub {{ margin: 0; font-size: 22px; line-height: 1.5; color: var(--muted); }}
  .og .visual {{ --arch-w: 318px; align-self: end; justify-content: flex-start; padding: 0 0 52px 100px; }}
</style></head>
<body><div class="og">
  <div>
    <div class="brand">
      <svg viewBox="0 0 40 40"><path d="M8.5 35V18.5a11.5 11.5 0 0 1 23 0V35" fill="none" stroke="#1F3B2D" stroke-width="2.4"/><circle cx="20" cy="23" r="4.6" fill="#E3A33B"/><path d="M11 30.5c3.6-2.6 7.4-2.8 10.4-1.4 2.6 1.2 5 1.1 7.6-.5" fill="none" stroke="#1F3B2D" stroke-width="2" stroke-linecap="round"/><path d="M5 35h30" stroke="#1F3B2D" stroke-width="2.4" stroke-linecap="round"/></svg>
      <span>The Farm Door</span>
    </div>
    <p class="pill"><span class="dot"></span>Launching soon</p>
    <h1>Something good is on its way to <em>your door.</em></h1>
    <p class="sub">Indian spices &amp; pantry essentials,<br>delivered across India.</p>
  </div>
  <div class="visual">{stage}</div>
</div></body></html>
"""

ICON = """<!doctype html>
<html><head><style>html,body{margin:0;width:180px;height:180px;overflow:hidden;background:#1F3B2D}</style></head>
<body><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="180" height="180">
  <rect width="64" height="64" fill="#1F3B2D"/>
  <path d="M20 49V31a12 12 0 0 1 24 0v18" fill="none" stroke="#F7F2E8" stroke-width="3.4"/>
  <circle cx="32" cy="35" r="5.6" fill="#E3A33B"/>
  <path d="M15.5 49h33" stroke="#F7F2E8" stroke-width="3.4" stroke-linecap="round"/>
</svg></body></html>
"""


def shoot(html: str, name: str, width: int, height: int, out: pathlib.Path) -> None:
    src = HERE / name
    src.write_text(html)
    subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
         "--force-device-scale-factor=1", f"--window-size={width},{height}",
         "--virtual-time-budget=6000", f"--screenshot={out}", src.as_uri()],
        check=True, capture_output=True,
    )
    print("wrote", out)


shoot(OG, "og-image.html", 1200, 630, HERE / "og-image.png")
shoot(ICON, "apple-touch-icon.html", 180, 180, SITE / "apple-touch-icon.png")

# JPEG keeps the preview small enough for WhatsApp (which skips large images).
subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "84",
                str(HERE / "og-image.png"), "--out", str(SITE / "og-image.jpg")],
               check=True, capture_output=True)
print("wrote", SITE / "og-image.jpg")
