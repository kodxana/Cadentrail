import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

export default function Code({
  text,
  label = "Copy example",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    setCopied(false);
    setFailed(false);
  }, [text]);
  return (
    <div className="integration-code">
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          if (!navigator.clipboard) {
            setFailed(true);
            return;
          }
          void navigator.clipboard.writeText(text).then(
            () => {
              setCopied(true);
              setFailed(false);
            },
            () => setFailed(true),
          );
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre tabIndex={0}>{text}</pre>
      {failed && (
        <small role="status">
          Copy is unavailable here. Select the example text to copy it.
        </small>
      )}
    </div>
  );
}
