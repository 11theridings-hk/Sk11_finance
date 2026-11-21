type ClientPdfLibs = {
  jsPDF: typeof import('jspdf').jsPDF
  autoTable: typeof import('jspdf-autotable').default
}

type JSZipConstructor = new () => import('jszip')

let pdfLibsPromise: Promise<ClientPdfLibs> | null = null
let jszipPromise: Promise<JSZipConstructor> | null = null

/** Lazy-load jspdf + jspdf-autotable only when an export runs. */
export function loadClientPdfLibs(): Promise<ClientPdfLibs> {
  if (!pdfLibsPromise) {
    pdfLibsPromise = Promise.all([import('jspdf'), import('jspdf-autotable')]).then(
      ([jspdf, autotable]) => ({
        jsPDF: jspdf.jsPDF,
        autoTable: autotable.default,
      })
    )
  }
  return pdfLibsPromise
}

/** Lazy-load JSZip only when a ZIP export runs. */
export function loadJSZip(): Promise<JSZipConstructor> {
  if (!jszipPromise) {
    jszipPromise = import('jszip').then((mod) => (mod.default ?? mod) as JSZipConstructor)
  }
  return jszipPromise
}
