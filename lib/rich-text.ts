export type RichTextChild = {
  type?: string;
  text?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type RichTextBlock = {
  type?: string;
  children?: RichTextChild[];
};

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeHtmlForCompare(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

export function extractPlainText(value: unknown): string {
  if (typeof value === 'string') {
    const withoutTags = value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '');
    return decodeHtmlEntities(withoutTags).replace(/\n{3,}/g, '\n\n').trim();
  }

  if (Array.isArray(value)) {
    const paragraphs = (value as RichTextBlock[])
      .map((block) => {
        const children = Array.isArray(block.children) ? block.children : [];
        return children
          .map((child) => cleanText(child?.text || ''))
          .filter(Boolean)
          .join(' ')
          .trim();
      })
      .filter(Boolean);
    return paragraphs.join('\n\n');
  }

  return '';
}

export function richValueToHtml(value: unknown): string {
  if (!value) return '<p></p>';

  if (Array.isArray(value)) {
    const paragraphs = (value as RichTextBlock[])
      .map((block) => {
        const children = Array.isArray(block.children) ? block.children : [];
        const richText = children
          .map((child) => {
            let text = escapeHtml(child?.text || '');
            if (!text.trim()) return '';
            if (child.underline) text = `<u>${text}</u>`;
            if (child.italic) text = `<em>${text}</em>`;
            if (child.bold) text = `<strong>${text}</strong>`;
            return text;
          })
          .filter(Boolean)
          .join('');
        return richText.trim() ? `<p>${richText}</p>` : '';
      })
      .filter(Boolean)
      .join('');

    return paragraphs || '<p></p>';
  }

  const plain = extractPlainText(value);
  if (!plain) return '<p></p>';
  return plain
    .split(/\n\s*\n/)
    .map((part) => `<p>${escapeHtml(part.replace(/\n/g, ' ').trim())}</p>`)
    .join('');
}

export function htmlToRichBlocks(value: string): RichTextBlock[] | null {
  let expanded = value;
  // Pell can emit style-based spans instead of semantic tags.
  for (let i = 0; i < 3; i += 1) {
    expanded = expanded.replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, (_, attrs: string, inner: string) => {
      const a = attrs.toLowerCase();
      let next = inner;
      if (a.includes('font-weight:') && (a.includes('bold') || a.includes('700') || a.includes('600'))) {
        next = `<strong>${next}</strong>`;
      }
      if (a.includes('font-style:') && a.includes('italic')) {
        next = `<em>${next}</em>`;
      }
      if (a.includes('text-decoration') && a.includes('underline')) {
        next = `<u>${next}</u>`;
      }
      return next;
    });
  }

  const clean = decodeHtmlEntities(expanded)
    .replace(/<\/div>/gi, '</p>')
    .replace(/<div[^>]*>/gi, '<p>')
    .replace(/<br\s*\/?>/gi, '\n')
    .trim();

  if (!clean) return null;

  const paragraphChunks = clean.includes('</p>')
    ? clean
        .split(/<\/p>/i)
        .map((chunk) => chunk.replace(/<p[^>]*>/i, '').trim())
        .filter(Boolean)
    : clean
        .split(/\n\s*\n/)
        .map((chunk) => chunk.trim())
        .filter(Boolean);

  if (!paragraphChunks.length) return null;

  return paragraphChunks.map((chunk) => {
    const tokens = chunk.split(/(<\/?(?:strong|b|em|i|u)>)/gi).filter((token) => token.length > 0);
    let bold = false;
    let italic = false;
    let underline = false;
    const children: RichTextChild[] = [];

    for (const token of tokens) {
      const lower = token.toLowerCase();
      if (lower === '<strong>' || lower === '<b>') {
        bold = true;
        continue;
      }
      if (lower === '</strong>' || lower === '</b>') {
        bold = false;
        continue;
      }
      if (lower === '<em>' || lower === '<i>') {
        italic = true;
        continue;
      }
      if (lower === '</em>' || lower === '</i>') {
        italic = false;
        continue;
      }
      if (lower === '<u>') {
        underline = true;
        continue;
      }
      if (lower === '</u>') {
        underline = false;
        continue;
      }

      const text = decodeHtmlEntities(token.replace(/<[^>]+>/g, ''));
      if (!text.trim()) continue;
      children.push({
        type: 'text',
        text,
        bold: bold || undefined,
        italic: italic || undefined,
        underline: underline || undefined,
      });
    }

    if (!children.length) {
      children.push({ type: 'text', text: decodeHtmlEntities(chunk.replace(/<[^>]+>/g, '')).trim() });
    }

    return {
      type: 'paragraph',
      children,
    };
  });
}

type StrapiRichTextPayloadFields = {
  title: string;
  slug: string;
  descriptionHtml: string;
  seoTitle?: string;
  seoDescription?: string;
  preserveStore?: Record<string, unknown>;
};

export function buildStrapiRichTextPayloads(fields: StrapiRichTextPayloadFields): Array<Record<string, unknown>> {
  const normalizedDescription = extractPlainText(fields.descriptionHtml);
  const richDescription = htmlToRichBlocks(fields.descriptionHtml);
  const preserved = fields.preserveStore || {};

  const seoRich = {
    metaTitle: fields.seoTitle || null,
    metaDescription: fields.seoDescription || null,
  };

  const richStore = {
    ...preserved,
    title: fields.title,
    Title: fields.title,
    slug: fields.slug,
    description: richDescription,
    Description: richDescription,
    SEO: seoRich,
  };

  const plainStore = {
    ...preserved,
    title: fields.title,
    Title: fields.title,
    slug: fields.slug,
    description: normalizedDescription || null,
    Description: normalizedDescription || null,
    SEO: seoRich,
  };

  return [
    {
      store: richStore,
    },
    {
      data: richStore,
    },
    {
      body: {
        store: richStore,
      },
    },
    {
      store: plainStore,
    },
    {
      data: {
        ...plainStore,
      },
    },
    {
      body: {
        store: {
          ...plainStore,
        },
      },
    },
  ];
}
