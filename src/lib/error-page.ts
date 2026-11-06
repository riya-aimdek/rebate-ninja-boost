export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 16px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.5rem; line-height: 1.2; font-weight: 700; letter-spacing: -0.025em; margin: 0 0 0.5rem; }
      @media (min-width: 640px) { h1 { font-size: 1.875rem; } }
      @media (min-width: 1024px) { h1 { font-size: 2.25rem; } }
      p { color: #4b5563; font-size: 1rem; max-width: 65ch; margin: 0 auto 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; font-size: 0.875rem; font-weight: 600; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      @media (min-width: 640px) { a, button { font-size: 1rem; } }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
