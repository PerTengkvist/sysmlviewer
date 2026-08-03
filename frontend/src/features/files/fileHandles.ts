/** Persist FileSystemFileHandle across refreshes (Chromium File System Access API). */

const DB_NAME = 'sysmlviewer-file-handles'
const STORE = 'handles'
const DB_VERSION = 1

export type PickedSysmlFile = {
  file: File
  handle: FileSystemFileHandle | null
  sourcePath: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

function handleKey(projectId: string, fileId: string): string {
  return `${projectId}:${fileId}`
}

export async function saveFileHandle(
  projectId: string,
  fileId: string,
  handle: FileSystemFileHandle,
): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB write failed'))
    tx.objectStore(STORE).put(handle, handleKey(projectId, fileId))
  })
  db.close()
}

export async function loadFileHandle(
  projectId: string,
  fileId: string,
): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDb()
    const handle = await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(handleKey(projectId, fileId))
      req.onsuccess = () => resolve((req.result as FileSystemFileHandle) ?? null)
      req.onerror = () => reject(req.error ?? new Error('indexedDB read failed'))
    })
    db.close()
    return handle
  } catch {
    return null
  }
}

export async function deleteFileHandlesForProject(projectId: string): Promise<void> {
  try {
    const db = await openDb()
    const prefix = `${projectId}:`
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        if (String(cursor.key).startsWith(prefix)) {
          cursor.delete()
        }
        cursor.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB delete failed'))
    })
    db.close()
  } catch {
    // best-effort cleanup
  }
}

function supportsOpenFilePicker(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function'
}

const SYSML_PICKER_TYPES: FilePickerAcceptType[] = [
  {
    description: 'SysML text',
    accept: {
      'text/plain': ['.sysml', '.txt'],
    },
  },
]

function pickViaInput(multiple: false): Promise<File>
function pickViaInput(multiple: true): Promise<File[]>
function pickViaInput(multiple: boolean): Promise<File | File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.sysml,.txt'
    input.multiple = multiple
    input.style.display = 'none'
    const cleanup = () => {
      input.remove()
    }
    input.addEventListener('change', () => {
      const list = input.files
      cleanup()
      if (!list?.length) {
        reject(new Error('No file selected'))
        return
      }
      if (multiple) resolve(Array.from(list))
      else resolve(list[0])
    })
    input.addEventListener('cancel', () => {
      cleanup()
      reject(new Error('File selection cancelled'))
    })
    document.body.appendChild(input)
    input.click()
  })
}

/** Open file dialog; prefer previous handle as startIn when available. */
export async function pickSysmlFile(options?: {
  existingHandle?: FileSystemFileHandle | null
}): Promise<PickedSysmlFile> {
  const existing = options?.existingHandle ?? null

  if (supportsOpenFilePicker()) {
    try {
      const pickerOpts: OpenFilePickerOptions = {
        multiple: false,
        types: SYSML_PICKER_TYPES,
        excludeAcceptAllOption: false,
      }
      if (existing) {
        pickerOpts.startIn = existing
      }
      const [handle] = await window.showOpenFilePicker(pickerOpts)
      const file = await handle.getFile()
      return {
        file,
        handle,
        sourcePath: file.name,
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('File selection cancelled')
      }
      // Fall through to input fallback
    }
  }

  const file = await pickViaInput(false)
  return {
    file,
    handle: null,
    sourcePath: file.webkitRelativePath || file.name,
  }
}

/** Multi-file pick for initial upload (handles when FSA available). */
export async function pickSysmlFiles(): Promise<PickedSysmlFile[]> {
  if (supportsOpenFilePicker()) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: SYSML_PICKER_TYPES,
        excludeAcceptAllOption: false,
      })
      return Promise.all(
        handles.map(async (handle) => {
          const file = await handle.getFile()
          return { file, handle, sourcePath: file.name }
        }),
      )
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('File selection cancelled')
      }
    }
  }

  const files = await pickViaInput(true)
  return files.map((file) => ({
    file,
    handle: null,
    sourcePath: file.webkitRelativePath || file.name,
  }))
}

export async function writeFileHandle(
  handle: FileSystemFileHandle,
  text: string,
): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

export async function exportSysmlFile(options: {
  content: string
  suggestedName: string
  existingHandle?: FileSystemFileHandle | null
}): Promise<{ handle: FileSystemFileHandle | null; sourcePath: string }> {
  if (supportsOpenFilePicker() && typeof window.showSaveFilePicker === 'function') {
    try {
      const opts: SaveFilePickerOptions = {
        suggestedName: options.suggestedName,
        types: SYSML_PICKER_TYPES,
      }
      if (options.existingHandle) {
        opts.startIn = options.existingHandle
      }
      const handle = await window.showSaveFilePicker(opts)
      await writeFileHandle(handle, options.content)
      return { handle, sourcePath: handle.name }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Export cancelled')
      }
      // fall through
    }
  }

  const blob = new Blob([options.content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = options.suggestedName
  a.click()
  URL.revokeObjectURL(url)
  return { handle: null, sourcePath: options.suggestedName }
}

declare global {
  interface Window {
    showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
  }

  interface OpenFilePickerOptions {
    multiple?: boolean
    types?: FilePickerAcceptType[]
    excludeAcceptAllOption?: boolean
    startIn?: FileSystemHandle | WellKnownDirectory
  }

  interface SaveFilePickerOptions {
    suggestedName?: string
    types?: FilePickerAcceptType[]
    excludeAcceptAllOption?: boolean
    startIn?: FileSystemHandle | WellKnownDirectory
  }

  type WellKnownDirectory =
    | 'desktop'
    | 'documents'
    | 'downloads'
    | 'music'
    | 'pictures'
    | 'videos'

  interface FilePickerAcceptType {
    description?: string
    accept: Record<string, string[]>
  }
}
