// Muestra un texto con los links (http://, https:// o www.) clickeables.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]'"])/gi;

export function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part.startsWith("www.") ? `https://${part}` : part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-indigo-600 underline hover:text-indigo-800"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function extractLinks(text: string) {
  return [...new Set(text.match(URL_RE) ?? [])];
}
