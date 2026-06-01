import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must mock store BEFORE importing apiClient so the interceptor picks up the mock
const mockLogout = vi.fn()
const mockSetToken = vi.fn()

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      accessToken: 'tok',
      setToken: mockSetToken,
      logout: mockLogout,
    }),
  },
}))

// Custom axios adapter: returns a 401 for any URL that matches a pattern
function make401Adapter(urlPattern: string) {
  return async (config: any) => {
    if ((config.url ?? '').includes(urlPattern)) {
      const err: any = new Error('Request failed with status code 401')
      err.response = { status: 401, data: { detail: 'Wrong credentials.' }, headers: {}, config }
      err.config = config
      err.isAxiosError = true
      throw err
    }
    // Shouldn't be called for other URLs in these tests
    return { status: 200, data: {}, headers: {}, config }
  }
}

const { default: apiClient } = await import('@/api/client')

describe('apiClient 401 interceptor — auth endpoint bypass', () => {
  beforeEach(() => {
    mockLogout.mockClear()
    mockSetToken.mockClear()
  })

  it('does NOT call logout when /auth/login returns 401', async () => {
    let caught: any = null
    try {
      await apiClient.post('/auth/login', { username: 'x', password: 'bad' }, {
        adapter: make401Adapter('/auth/login'),
      })
    } catch (err) {
      caught = err
    }

    expect(caught).not.toBeNull()
    expect(caught.response?.status).toBe(401)
    expect(mockLogout).not.toHaveBeenCalled()
  })

  it('does NOT call logout when /auth/refresh returns 401', async () => {
    let caught: any = null
    try {
      await apiClient.post('/auth/refresh', {}, {
        adapter: make401Adapter('/auth/refresh'),
      })
    } catch (err) {
      caught = err
    }

    expect(caught).not.toBeNull()
    expect(caught.response?.status).toBe(401)
    expect(mockLogout).not.toHaveBeenCalled()
  })

  it('propagates error detail so LoginPage can read it', async () => {
    let caught: any = null
    try {
      await apiClient.post('/auth/login', { username: 'x', password: 'bad' }, {
        adapter: make401Adapter('/auth/login'),
      })
    } catch (err) {
      caught = err
    }

    expect(caught?.response?.data?.detail).toBe('Wrong credentials.')
  })
})
