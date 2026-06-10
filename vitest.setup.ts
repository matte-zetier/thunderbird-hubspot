import { beforeAll, afterAll, afterEach, vi } from 'vitest'
import { messengerMock } from './src/test-utils/messenger-mock'
import { server } from './src/test-utils/server'

// Inject the messenger global that Thunderbird normally provides at runtime
vi.stubGlobal('messenger', messengerMock)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  server.resetHandlers()
  // Clear call history between tests without discarding default implementations
  vi.clearAllMocks()
})

afterAll(() => server.close())
