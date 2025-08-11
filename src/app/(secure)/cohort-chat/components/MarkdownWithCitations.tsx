"use client";

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { optionalRemark, optionalRehype, normaliseText, normalizeMarkdown } from '../utils';

type Props = {
  text: string;
  citations?: Record<string, string>;
  isUpload?: boolean;
};

export default function MarkdownWithCitations({ text, citations, isUpload }: Props) {
  const normalizedText = isUpload ? text : normalizeMarkdown(normaliseText(text));

  if (!citations || Object.keys(citations).length === 0) {
    if (isUpload) {
      const paragraphs = normalizedText.split('\n\n').filter((p) => p.trim());
      return (
        <div className="space-y-2">
          {paragraphs.map((paragraph, index) => (
            <div key={index} className="text-foreground">
              {paragraph.trim()}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-p:text-foreground prose-p:leading-relaxed prose-strong:text-foreground prose-strong:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-ul:text-foreground prose-ol:text-foreground prose-li:text-foreground prose-li:my-1 prose-blockquote:text-foreground prose-blockquote:border-l-primary">
        <ReactMarkdown
          remarkPlugins={optionalRemark}
          rehypePlugins={optionalRehype}
          components={{
            h1: ({ children }) => <h1 className="text-xl font-bold mb-4 mt-6 first:mt-0 text-foreground border-b border-border pb-2">{children}</h1>,
            h2: ({ children }) => <h2 className="text-lg font-semibold mb-3 mt-5 first:mt-0 text-foreground">{children}</h2>,
            h3: ({ children }) => <h3 className="text-base font-medium mb-2 mt-4 first:mt-0 text-foreground">{children}</h3>,
            p: ({ children }) => <p className="mb-3 leading-relaxed text-foreground">{children}</p>,
            ul: ({ children }) => <ul className="list-disc ml-0 mb-4 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal ml-0 mb-4 space-y-1">{children}</ol>,
            li: ({ children }) => <li className="text-foreground leading-relaxed">{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
            em: ({ children }) => <em className="italic text-foreground">{children}</em>,
            blockquote: ({ children }) => <blockquote className="border-l-4 border-primary pl-4 my-4 italic text-muted-foreground">{children}</blockquote>,
            hr: () => <hr className="my-6 border-border" />,
            code: ({ children }) => <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>,
          }}
        >
          {normalizedText}
        </ReactMarkdown>
      </div>
    );
  }

  const CitationMarkdown = ({ children }: { children: React.ReactNode }) => {
    const extractText = (node: React.ReactNode): string => {
      if (typeof node === 'string') return node;
      if (typeof node === 'number') return String(node);
      if (node === null || node === undefined) return '';
      if (typeof node === 'boolean') return '';
      if (Array.isArray(node)) return node.map(extractText).join('');
      if (React.isValidElement(node)) {
        const props = node.props as any;
        if (props && props.children) return extractText(props.children);
        return '';
      }
      if (typeof node === 'object') {
        try {
          if ((node as any).toString && (node as any).toString !== Object.prototype.toString) {
            return (node as any).toString();
          }
        } catch {}
        return '';
      }
      return String(node);
    };

    const textContent = extractText(children);
    const parts = textContent.split(/(\[\d+\])/);

    return (
      <>
        {parts.map((part, index) => {
          const citationMatch = part.match(/\[(\d+)\]/);
          if (citationMatch) {
            const num = citationMatch[1];
            const quote = citations?.[num];
            return (
              <Tooltip key={`citation-${index}-${num}`}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-baseline px-1 py-0 mx-0.5 rounded bg-blue-100 cursor-default text-blue-700 hover:bg-blue-200 font-medium text-xs border border-blue-200 leading-none align-baseline">
                    {num}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-lg text-xs p-3 bg-white border border-gray-200 shadow-lg z-[9999]" side="top" align="start">
                  <div className="space-y-1">
                    {quote ? (
                      <div className="whitespace-pre-wrap break-words text-gray-900">{String(quote)}</div>
                    ) : (
                      <div className="text-gray-500">Quote not found for [{num}]</div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          }
          return <span key={index}>{part}</span>;
        })}
      </>
    );
  };

  return (
    <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-p:text-foreground prose-p:leading-relaxed prose-strong:text-foreground prose-strong:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-ul:text-foreground prose-ol:text-foreground prose-li:text-foreground prose-li:my-1 prose-blockquote:text-foreground prose-blockquote:border-l-primary">
      <ReactMarkdown
        remarkPlugins={optionalRemark}
        rehypePlugins={optionalRehype}
        components={{
          h1: ({ children }) => <h1 className="text-xl font-bold mb-4 mt-6 first:mt-0 text-foreground border-b border-border pb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-semibold mb-3 mt-5 first:mt-0 text-foreground">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-medium mb-2 mt-4 first:mt-0 text-foreground">{children}</h3>,
          p: ({ children }) => (
            <p className="mb-3 leading-relaxed text-foreground">
              <CitationMarkdown>{children}</CitationMarkdown>
            </p>
          ),
          ul: ({ children }) => <ul className="list-disc ml-0 mb-4 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal ml-0 mb-4 space-y-1">{children}</ol>,
          li: ({ children }) => (
            <li className="text-foreground leading-relaxed">
              <CitationMarkdown>{children}</CitationMarkdown>
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              <CitationMarkdown>{children}</CitationMarkdown>
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground">
              <CitationMarkdown>{children}</CitationMarkdown>
            </em>
          ),
          blockquote: ({ children }) => <blockquote className="border-l-4 border-primary pl-4 my-4 italic text-muted-foreground">{children}</blockquote>,
          hr: () => <hr className="my-6 border-border" />,
          code: ({ children }) => <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>,
        }}
      >
        {normalizedText}
      </ReactMarkdown>
    </div>
  );
}



