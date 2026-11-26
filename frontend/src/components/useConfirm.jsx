import { useState } from 'react'
import ConfirmDialog from './ConfirmDialog'

// const [confirm, confirmDialog] = useConfirm()
// if (!(await confirm({ title, message, confirmLabel }))) return
// ...e {confirmDialog} nel JSX della pagina.
export function useConfirm() {
  const [request, setRequest] = useState(null)

  function confirm(options) {
    return new Promise((resolve) => setRequest({ ...options, resolve }))
  }

  const dialog = (
    <ConfirmDialog
      request={request}
      onDone={(ok) => {
        request?.resolve(ok)
        setRequest(null)
      }}
    />
  )
  return [confirm, dialog]
}
