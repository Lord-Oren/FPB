import nunitoLicense from '../assets/fonts/NunitoSans-OFL.txt?raw';
import boohong from '../assets/fonts/Boohong.otf?inline';
import nunito300 from '../assets/fonts/NunitoSans-latin-300.woff2?inline';
import nunito300ext from '../assets/fonts/NunitoSans-latin-ext-300.woff2?inline';
import nunito700 from '../assets/fonts/NunitoSans-latin-700.woff2?inline';
import nunito700ext from '../assets/fonts/NunitoSans-latin-ext-700.woff2?inline';
import nunito900 from '../assets/fonts/NunitoSans-latin-900.woff2?inline';
import nunito900ext from '../assets/fonts/NunitoSans-latin-ext-900.woff2?inline';

// Explicit inline imports keep the fonts inside every exported page.
// Nunito Sans (SIL OFL 1.1, NunitoSans-OFL.txt) replaces Museo Sans, whose web licence was not established.
const latin = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const latinExt = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const faces = [
  ['Boohong', boohong, 400, 'opentype'],
  ['Nunito Sans', nunito300ext, 300, 'woff2', latinExt], ['Nunito Sans', nunito300, 300, 'woff2', latin],
  ['Nunito Sans', nunito700ext, 700, 'woff2', latinExt], ['Nunito Sans', nunito700, 700, 'woff2', latin],
  ['Nunito Sans', nunito900ext, 900, 'woff2', latinExt], ['Nunito Sans', nunito900, 900, 'woff2', latin],
];
export default `/* ${nunitoLicense} */\n` + faces.map(([family, source, weight, format, range]) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(${source}) format('${format}')${range ? `;unicode-range:${range}` : ''}}`
).join('\n');
