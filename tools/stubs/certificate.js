export function drawCertificate(c, W, H, d) {
  c.fillStyle = '#fffaf1'; c.fillRect(0, 0, W, H); c.strokeStyle = '#3fb3a6'; c.lineWidth = 30; c.strokeRect(20, 20, W - 40, H - 40);
  c.fillStyle = '#25385c'; c.textAlign = 'center'; c.font = '800 80px sans-serif'; c.fillText('شهادة', W / 2, H * 0.3); c.font = '700 60px sans-serif'; c.fillText(d.name + ' ' + d.score + '/' + d.total, W / 2, H * 0.55);
}
