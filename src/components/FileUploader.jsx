/**
 * FileUploader.jsx
 *
 * Renders a file upload area for a single file.
 * Calls onLoad(content, fileName) when a file is selected. Content is a string
 * by default, or an ArrayBuffer with readAs="arrayBuffer" (binary formats).
 * Calls onError(message, fileName) if the browser cannot read the file.
 */

import { useRef } from 'react'

export default function FileUploader({
  label,
  description,
  onLoad,
  onError,
  hasData,
  fileName,
  accept = '.csv',
  readAs = 'text',
  busy = false,
}) {
  const inputRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => onLoad(evt.target.result, file.name)
    reader.onerror = () => onError?.('The file could not be read. Try uploading it again.', file.name)
    if (readAs === 'arrayBuffer') {
      reader.readAsArrayBuffer(file)
    } else {
      reader.readAsText(file)
    }
    // Reset input so the same file can be re-uploaded
    e.target.value = ''
  }

  return (
    <div
      style={{
        border: `2px dashed ${hasData ? '#1e5c2c' : '#CECECE'}`,
        borderRadius: 6,
        padding: '1rem 1.2rem',
        background: hasData ? '#f0faf2' : '#fafafa',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ fontSize: 20 }}>{hasData ? '✅' : '📄'}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#131A48' }}>{label}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            {busy ? 'Reading…' : hasData ? fileName : description}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: hasData ? '#1e5c2c' : '#FF5800',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {hasData ? 'Change' : 'Upload'}
          </span>
        </div>
      </div>
    </div>
  )
}
