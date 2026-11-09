import { rewriteFormsForCapture } from './form-rewriter';

describe('rewriteFormsForCapture', () => {
  it('убирает action и method, оставляет остальные атрибуты', () => {
    const input = '<form id="login" action="https://evil.example/login" method="GET" class="x">';
    const result = rewriteFormsForCapture(input);
    expect(result).not.toContain('evil.example');
    expect(result).not.toContain('method="GET"');
    expect(result).toContain('id="login"');
    expect(result).toContain('class="x"');
    expect(result).toContain('action=""');
    expect(result).toContain('method="post"');
  });

  it('работает с несколькими формами на странице', () => {
    const input = '<form action="/a">...</form><form action="/b" method="post">...</form>';
    const result = rewriteFormsForCapture(input);
    expect(result).not.toContain('action="/a"');
    expect(result).not.toContain('action="/b"');
  });

  it('не падает на форме без action/method', () => {
    const input = '<form id="bare">';
    const result = rewriteFormsForCapture(input);
    expect(result).toContain('id="bare"');
    expect(result).toContain('action=""');
  });

  it('не трогает остальной HTML', () => {
    const input = '<div>text</div><form action="/x"><input name="q"></form>';
    const result = rewriteFormsForCapture(input);
    expect(result).toContain('<div>text</div>');
    expect(result).toContain('<input name="q">');
  });
});
