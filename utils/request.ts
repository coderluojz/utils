import axios from 'axios'
import type { AxiosInstance, AxiosResponse } from 'axios'
import type {
  ApiResponse,
  HttpClientInterceptors,
  HttpClientOptions,
  InternalRequestConfig,
  RequestConfig,
  RequestHandlers,
  StreamRequestOptions,
  StreamCallbacks,
  StreamResponse,
} from '../types/request'

export class HttpClient {
  private readonly instance: AxiosInstance
  private readonly handlers: RequestHandlers
  private readonly baseURL: string

  // 默认配置
  private static readonly defaultConfig: RequestConfig = {
    showGlobalMessage: true,
    successCode: 10000,
    enableCodeCheck: true,
  }

  constructor({
    baseURL,
    axiosConfig = {},
    customInterceptors = {},
    handlers = {},
  }: HttpClientOptions) {
    this.baseURL = baseURL
    this.instance = axios.create({
      baseURL,
      timeout: 10000,
      ...axiosConfig,
    })
    this.handlers = handlers

    this.setupInterceptors(customInterceptors)
  }

  // 请求拦截器——成功
  private requestOnFulfilled(
    config: InternalRequestConfig
  ): InternalRequestConfig {
    config = { ...HttpClient.defaultConfig, ...config }

    // 处理请求头，例如添加 token
    if (this.handlers && this.handlers?.handleRequestHeader) {
      config = this.handlers?.handleRequestHeader(config)
    }

    return config
  }
  // 请求拦截器——失败
  private requestOnRejected(error: any): any {
    return Promise.reject(error)
  }
  // 响应拦截器——成功
  private responseOnFulfilled(response: AxiosResponse<ApiResponse>) {
    const config = response.config as RequestConfig
    const res = response.data
    // 检查业务成功码
    const isSuccess = config?.enableCodeCheck
      ? config?.successCode === res.code
      : true

    if (!isSuccess) {
      // 处理业务错误
      const errorMessage = res.message || `请求失败，业务码：${res.code}`

      if (this.handlers?.handleBackendError) {
        this.handlers.handleBackendError(res.code, res.message)
      } else if (config?.showGlobalMessage) {
        // 触发全局错误提示
        this.handlers?.handleGlobalMessage?.(errorMessage)
      }
      return Promise.reject(res)
    }

    return res
  }
  // 响应拦截器——失败
  private responseOnRejected(error: any): any {
    const config = error.config as RequestConfig

    let errorMessage = '未知错误'
    if (axios.isCancel(error)) {
      errorMessage = '请求已取消'
    } else if (error.response) {
      // 服务器返回了非 2xx 状态码
      const status = error.response.status
      switch (status) {
        case 401:
          errorMessage = '未授权，请重新登录'
          // 这里可以触发重新登录逻辑
          break
        case 403:
          errorMessage = '拒绝访问'
          break
        case 404:
          errorMessage = `请求地址不存在: ${error.response.config?.url}`
          break
        case 500:
          errorMessage = '服务器内部错误'
          break
        default:
          errorMessage = `HTTP错误: ${status}`
      }
    } else if (error.request) {
      errorMessage = '网络错误，无法连接到服务器'
    }
    if (config?.showGlobalMessage) {
      // 触发全局错误提示
      this.handlers?.handleGlobalMessage?.(errorMessage)
    }
    return Promise.reject({ ...error, message: errorMessage })
  }

  private setupInterceptors(interceptors?: HttpClientInterceptors): void {
    // 请求拦截器
    this.instance.interceptors.request.use(
      interceptors?.requestOnFulfilled || this.requestOnFulfilled.bind(this),
      interceptors?.requestOnRejected || this.requestOnRejected.bind(this)
    )

    // 响应拦截器
    this.instance.interceptors.response.use(
      interceptors?.responseOnFulfilled || this.responseOnFulfilled.bind(this),
      interceptors?.responseOnRejected || this.responseOnRejected.bind(this)
    )
  }

  public request<T>(config: RequestConfig): Promise<T> {
    // 这里将 ApiResponse<T> 断言为 T，因为拦截器已经处理了外层结构
    return this.instance.request<any, T>(config)
  }

  public get<T>(
    url: string,
    params?: object,
    config?: RequestConfig
  ): Promise<T> {
    return this.request<T>({ ...config, url, method: 'GET', params })
  }

  public post<T>(
    url: string,
    data?: object,
    config?: RequestConfig
  ): Promise<T> {
    return this.request<T>({ ...config, url, method: 'POST', data })
  }

  public put<T>(
    url: string,
    data?: object,
    config?: RequestConfig
  ): Promise<T> {
    return this.request<T>({ ...config, url, method: 'PUT', data })
  }

  public delete<T>(
    url: string,
    params?: object,
    config?: RequestConfig
  ): Promise<T> {
    return this.request<T>({ ...config, url, method: 'DELETE', params })
  }

  /**
   * 发起流式请求
   */
  public async stream(
    options: StreamRequestOptions,
    callbacks: StreamCallbacks = {}
  ): Promise<StreamResponse> {
    const {
      url,
      baseURL = this.baseURL,
      method = 'POST',
      headers = {},
      body,
      signal,
      extractContent,
    } = options
    const { onMessage, onError, onComplete, onStart } = callbacks

    const controller = new AbortController()
    const requestSignal = signal || controller.signal

    let fullText = ''

    try {
      onStart?.()

      const response = await fetch(`${baseURL}${url}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: requestSignal,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Response body is not readable')
      }

      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        const chunk = decoder.decode(value, { stream: true })

        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.trim() === '') continue

          // 处理 SSE 格式
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()

            // 检查是否是结束标志
            if (data === '[DONE]') {
              onComplete?.(fullText)
              return { fullText, abort: () => controller.abort() }
            }

            try {
              // 尝试解析 JSON 格式的数据
              const parsed = JSON.parse(data)
              const content = extractContent?.(parsed) || parsed
              if (content) {
                fullText += content
                onMessage?.(content, fullText)
              }
            } catch {
              // 如果不是 JSON，直接作为文本处理
              fullText += data
              onMessage?.(data, fullText)
            }
          } else {
            // 处理普通流式文本
            fullText += line
            onMessage?.(line, fullText)
          }
        }
      }

      onComplete?.(fullText)
      return { fullText, abort: () => controller.abort() }
    } catch (error) {
      const err = error as Error
      onError?.(err)
      throw err
    }
  }
}

// 使用示例
// const requestInstance = new HttpClient({
// 	baseURL: 'xxxx',
// 	handlers: {
// 		handleRequestHeader: config => {
// 			config?.headers.Authorization = 'Bearer token'
// 			return config
// 		},
// 		handleGlobalMessage: message => {
// 			console.log('全局提示:', message)
// 		},
// 		handleBackendError: (code, message) => {
// 			console.log('后端错误:', code, message)
// 		},
// 	},
// 	customInterceptors: {
// 		requestOnFulfilled: config => {
// 			console.log('请求拦截器:', config)
// 			return config
// 		},
// 		responseOnFulfilled: response => {
// 			console.log('响应拦截器:', response)
// 			return response
// 		},
// 	},
// 	axiosConfig: {
// 		timeout: 1000 * 60,
// 		showGlobalMessage: true,
// 		successCode: 200,
// 	},
// })

// requestInstance.get<{ name: 'xxxx' }>(
// 	'xxxx',
// 	{ id: 1 },
// 	{ showGlobalMessage: false },
// )
// requestInstance.post<{ name: 'xxxx' }>(
// 	'xxxx',
// 	{ name: '张三' },
// 	{ showGlobalMessage: false },
// )
// requestInstance.put<{ name: 'xxxx' }>(
// 	'xxxx',
// 	{ name: '张三' },
// 	{ showGlobalMessage: false },
// )
// requestInstance.delete<{ name: 'xxxx' }>(
// 	'xxxx',
// 	{ id: 1 },
// 	{ showGlobalMessage: false },
// )

// requestInstance.stream(
// 	{
// 		url: 'xxxx',
// 		method: 'POST',
// 		body: {...},
// 	},
// 	{
// 		onStart: () => {
// 			console.log('开始接收流式数据...\n')
// 		},
// 		onMessage: (chunk, fullText) => {
// 			console.log(`流式数据: ${fullText}`)
// 		},
// 		onComplete: fullText => {
// 			console.log(`最终内容: ${fullText}`)
// 		},
// 		onError: err => {
// 			console.log('err: ', err);
// 		},
// 	},
// )
