import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUseIsFetching = vi.fn(() => 0)

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return { ...actual, useIsFetching: mockUseIsFetching }
})

// Import AFTER mock is registered
const { default: GlobalLoadingBar } = await import(
  '@/components/layout/GlobalLoadingBar'
)

describe('GlobalLoadingBar', () => {
  beforeEach(() => {
    mockUseIsFetching.mockReset()
  })

  it('renders nothing when no queries are in-flight', () => {
    mockUseIsFetching.mockReturnValue(0)
    const { container } = render(<GlobalLoadingBar />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('renders a progressbar when one query is in-flight', () => {
    mockUseIsFetching.mockReturnValue(1)
    render(<GlobalLoadingBar />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders a progressbar when multiple queries are in-flight', () => {
    mockUseIsFetching.mockReturnValue(5)
    render(<GlobalLoadingBar />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })
})
