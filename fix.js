const fs = require('fs');
let css = fs.readFileSync('Frontend/css/style.css', 'utf8');

css = css.replace(/:root \{[\s\S]*?\}/, `:root {
  --primary: #2563EB;
  --primary-dark: #1D4ED8;
  --primary-light: #60A5FA;
  --secondary: #0ea5e9;
  --accent: #F59E0B;
  --warning: #F59E0B;
  --success: #10B981;
  --danger: #EF4444;

  --bg: #F3F4F6;
  --bg-card: #FFFFFF;
  --bg-card2: #F9FAFB;
  --bg-sidebar: #FFFFFF;
  --border: #E5E7EB;
  --border-hover: #D1D5DB;

  --text-primary: #111827;
  --text-secondary: #4B5563;
  --text-muted: #6B7280;

  --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-glow: 0 0 0 transparent;
  --radius: 12px;
  --radius-sm: 8px;
  --sidebar-w: 260px;
}`);

css = css.replace(/rgba\(255,255,255,/g, 'rgba(0,0,0,');
css = css.replace(/color: #fff;/g, 'color: #ffffff;');

fs.writeFileSync('Frontend/css/style.css', css, 'utf8');
console.log('Successfully updated style.css for light theme!');
