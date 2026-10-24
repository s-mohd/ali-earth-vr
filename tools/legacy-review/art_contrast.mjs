// Contrast ratios for the proposed palette (WCAG relative luminance).
const L = (h) => { const c = [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255).map(v => v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; };
const cr = (a,b) => { const x=L(a), y=L(b); return ((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)).toFixed(2); };
const pairs = [
 ['ink on cream','#1F2F57','#FFF6E6'], ['inkSoft on cream','#4A5A80','#FFF6E6'], ['ink on white bubble','#1F2F57','#FFFFFF'],
 ['ink on CTA sun','#1F2F57','#FF9F1C'], ['white on CTA sun','#FFFFFF','#FF9F1C'],
 ['white on teal secondary','#FFFFFF','#128C8A'], ['white on lavender back','#FFFFFF','#7A6CC9'],
 ['white on quake','#FFFFFF','#D6457A'], ['white on volcano','#FFFFFF','#E8492A'], ['white on weathering','#FFFFFF','#7B5FD6'],
 ['white on erosion','#FFFFFF','#1C84DB'], ['ink on human','#1F2F57','#FFC22E'],
 ['white on correct','#FFFFFF','#1C9A57'], ['white on wrong','#FFFFFF','#E0464B'],
 ['V2 wrong label (#7a3b2e on #f3a48e)','#7a3b2e','#f3a48e'], ['V2 ink on grey card (#3b3456 on ~#9c98a3)','#3b3456','#9c98a3'],
 ['V1 white on orange 3D btn (#fff on #ffad5c)','#FFFFFF','#ffad5c'], ['V2 white on coral btn (#fff on #f08a78)','#FFFFFF','#f08a78'],
 ['V2 white on teal btn (#fff on #4fb3a9)','#FFFFFF','#4fb3a9'], ['V2 white on lav btn (#fff on #a497df)','#FFFFFF','#a497df'],
 ['crack on V2 road (#5e5172 on #b8b3cb)','#5e5172','#b8b3cb'], ['crack on V1 road (#4c3628 on #9aa4b0)','#4c3628','#9aa4b0'],
 ['crack on new asphalt (#2A1E1A on #6B7684)','#2A1E1A','#6B7684'], ['crack rim on asphalt (#E8C79A on #6B7684)','#E8C79A','#6B7684'],
 ['lava on V2 cone (#ff9a6e on #d5ae9e)','#ff9a6e','#d5ae9e'], ['lava on new basalt (#FF7A2E on #5B4A4A)','#FF7A2E','#5B4A4A'],
];
for (const [n,a,b] of pairs) console.log(cr(a,b).padStart(6), ' ', n);
