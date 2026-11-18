// A real syntax check for the app's modules: parse each as an ES module (node --check does not reject these files).
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
let bad = 0;
for (const dir of ['js', 'js/draw']) for (const f of readdirSync(dir)) {
  if (!f.endsWith('.js')) continue;
  try { new vm.SourceTextModule(readFileSync(`${dir}/${f}`, 'utf8'), { identifier: f }); } catch (e) { bad++; console.log(`SYNTAX ${dir}/${f}: ${e.message}`); }
}
console.log(bad ? `${bad} files with syntax errors` : 'all modules parse');
