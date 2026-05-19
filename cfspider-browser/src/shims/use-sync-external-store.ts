// Shim for use-sync-external-store ESM compatibility
import { useSyncExternalStore } from 'react'

export const useSyncExternalStoreWithSelector = <Snapshot, Selection>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot: (() => Snapshot) | undefined,
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (a: Selection, b: Selection) => boolean
): Selection => {
  const getSelection = () => selector(getSnapshot())
  return useSyncExternalStore(subscribe, getSelection, getServerSnapshot ? () => selector(getServerSnapshot()) : undefined)
}

export default useSyncExternalStoreWithSelector
