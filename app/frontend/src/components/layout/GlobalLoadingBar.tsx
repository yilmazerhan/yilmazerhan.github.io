import { useIsFetching } from '@tanstack/react-query'

export default function GlobalLoadingBar() {
  const isFetching = useIsFetching()
  if (isFetching === 0) return null
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className="fixed top-0 left-0 right-0 h-0.5 z-[200] bg-primary-100 dark:bg-primary-950 overflow-hidden"
    >
      <div className="h-full w-2/5 bg-primary-500 animate-indeterminate" />
    </div>
  )
}
