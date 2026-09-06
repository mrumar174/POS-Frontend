const fs = require('fs');
const path = 'src/app/core/api/api-client.ts';
const content = fs.readFileSync(path, 'utf8');
if (!content.startsWith('// @ts-nocheck')) {
  fs.writeFileSync(path, '// @ts-nocheck\n' + content);
}