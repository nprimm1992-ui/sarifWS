Optional ambient videos for /about (AboutDossierCard).

Preferred paths (deploy these for clean URLs):
  public/media/about/context-flow.mp4
  public/media/about/amber-network.mp4

The same clips may instead live at the repo root (checked first at build time):
  public/Context flow.mp4
  public/Amber_Light_Network_In_a_cinematic_style_a_man_with_short_brown_hair_kY2lTZ1w.mp4

If none exist at build time, HTML still references the /media/about/ URLs — add the MP4s
before deploy or you will see 404 on those requests.

Use H.264 + AAC, yuv420p. Keep files modest in size for LCP.
