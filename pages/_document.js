import Document, { Html, Head, Main, NextScript } from 'next/document';

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head />
        <body>
          {/* This script runs before React hydrates and ensures the saved theme is applied.
              It reads localStorage('theme') and adds the theme-dark class to the html element. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function() {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark') {
      document.documentElement.classList.add('theme-dark');
    } else {
      document.documentElement.classList.remove('theme-dark');
    }
  } catch (e) {}
})();`,
            }}
          />
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;