const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let stack = [];
const tagRegex = /<\/?([a-zA-Z0-9:-]+)([^>]*?)>/g;
let match;
while ((match = tagRegex.exec(html)) !== null) {
  const fullTag = match[0];
  const tagName = match[1].toLowerCase();
  const attributes = match[2];
  const isClosing = fullTag.startsWith('</');
  const isSelfClosing = attributes.endsWith('/') || ['img', 'input', 'br', 'hr', 'meta', 'link'].includes(tagName);

  if (isClosing) {
    if (stack.length > 0) {
      stack.pop();
    }
  } else if (!isSelfClosing) {
    const idMatch = /id=["']([^"']+)["']/.exec(attributes);
    const classMatch = /class=["']([^"']+)["']/.exec(attributes);
    const id = idMatch ? idMatch[1] : '';
    const className = classMatch ? classMatch[1] : '';

    const newEl = {
      name: tagName,
      id: id,
      class: className
    };

    if (className.includes('view-panel')) {
      console.log(`\n--- view-panel: id="${id}" class="${className}" ---`);
      stack.forEach((el, index) => {
        console.log(`${'  '.repeat(index)}<${el.name} id="${el.id}" class="${el.class}">`);
      });
      console.log(`${'  '.repeat(stack.length)}<${newEl.name} id="${newEl.id}" class="${newEl.class}">`);
    }

    stack.push(newEl);
  }
}
