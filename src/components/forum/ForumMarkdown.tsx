import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';

type ForumMarkdownProps = {
  text: string;
  className?: string;
};

export function ForumMarkdown({ text, className }: ForumMarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeSanitize]}
        skipHtml
        components={{
          p: ({ ...props }) => <p {...props} className="m-0" />,
          h1: ({ ...props }) => (
            <h1 {...props} className="mt-2 mb-1 text-xl font-bold" />
          ),
          h2: ({ ...props }) => (
            <h2 {...props} className="mt-2 mb-1 text-lg font-bold" />
          ),
          h3: ({ ...props }) => (
            <h3 {...props} className="mt-2 mb-1 text-base font-bold" />
          ),
          ul: ({ ...props }) => <ul {...props} className="m-0 pl-5 list-disc" />,
          ol: ({ ...props }) => <ol {...props} className="m-0 pl-5 list-decimal" />,
          li: ({ ...props }) => <li {...props} className="m-0" />,
          blockquote: ({ ...props }) => (
            <blockquote
              {...props}
              className="m-0 mt-2 mb-2 pl-3 border-l-4 border-gray-300 text-gray-800 italic"
            />
          ),
          // Keep code blocks readable; inline code too.
          code: ({ inline, className: codeClassName, ...props }) => {
            if (inline) {
              return <code {...props} className="px-1 py-0.5 bg-gray-100 rounded-sm" />;
            }
            return (
              <pre
                {...props}
                className="m-0 overflow-auto p-2 bg-gray-100 rounded-sm"
              >
                <code className={codeClassName} />
              </pre>
            );
          },
          a: ({ ...props }) => {
            // Ensure external links open in a new tab; keep internal behavior unchanged.
            const href = String(props.href ?? '');
            const isExternal = /^https?:\/\//i.test(href);
            return (
              <a
                {...props}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
              />
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

