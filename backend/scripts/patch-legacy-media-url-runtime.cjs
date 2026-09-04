const fs = require('node:fs');

const TARGETS = [
  '/app/dist/src/posts/posts.service.js',
  '/app/dist/src/stories/stories.service.js',
];

const ORIGINAL = `function resolveMediaUrl(url) {
    if (!url)
        return null;
    if (url.startsWith('http://') || url.startsWith('https://'))
        return url;
    const apiBase = process.env.API_BASE_URL || 'https://api.nxqsocial.com/api';
    return \`${'${apiBase}${url}'}\`;
}`;

const REPLACEMENT = `function resolveMediaUrl(url) {
    if (!url)
        return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
        let parsed;
        try {
            parsed = new URL(url);
        }
        catch {
            return null;
        }
        if (/\\.r2\\.cloudflarestorage\\.com$/i.test(parsed.hostname)) {
            const bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET;
            const publicBase = process.env.S3_PUBLIC_BASE_URL ?? process.env.S3_PUBLIC_BASE;
            if (!bucket || !publicBase)
                return null;
            let base;
            try {
                base = new URL(publicBase.endsWith('/') ? publicBase : \`${'${publicBase}/'}\`);
            }
            catch {
                return null;
            }
            if (base.protocol !== 'https:')
                return null;
            let key = parsed.pathname.replace(/^\\/+/, '');
            if (key.startsWith(\`${'${bucket}/'}\`))
                key = key.slice(bucket.length + 1);
            const validPrefix = /^(avatars|banners|images|videos|audio|thumbnails|uploads)\\//.test(key);
            const unsafeSegment = key.split('/').some((segment) => !segment || segment === '.' || segment === '..');
            if (!validPrefix || unsafeSegment || key.includes('\\\\'))
                return null;
            return new URL(key, base).toString();
        }
        return url;
    }
    const apiBase = process.env.API_BASE_URL || 'https://api.nxqsocial.com/api';
    return \`${'${apiBase}${url}'}\`;
}`;

function patchSource(source, target = 'runtime module') {
  const occurrences = source.split(ORIGINAL).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `${target}: expected exactly one legacy resolveMediaUrl implementation, found ${occurrences}`,
    );
  }
  return source.replace(ORIGINAL, REPLACEMENT);
}

function patchFile(target) {
  const source = fs.readFileSync(target, 'utf8');
  fs.writeFileSync(target, patchSource(source, target));
}

if (require.main === module) {
  for (const target of TARGETS) patchFile(target);
}

module.exports = { ORIGINAL, REPLACEMENT, patchSource };
