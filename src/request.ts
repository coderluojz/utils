import axios from 'axios'
import type {
  AxiosInstance,
  AxiosResponse,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios'

export interface HttpClientOptions {
  baseURL: string
  handlers?: RequestHandlers
  customInterceptors?: HttpClientInterceptors
  axiosConfig?: RequestConfig
}

// 自定义扩展的 Axios 请求配置
export interface CustomRequestConfig {
  // 是否显示全局提示
  showGlobalMessage?: boolean
  // 自定义的成功状态码
  successCode?: number
}

export type RequestConfig = AxiosRequestConfig & CustomRequestConfig

export type InternalRequestConfig = InternalAxiosRequestConfig &
  CustomRequestConfig

// 响应数据的统一结构
export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
}

// 请求处理函数
export interface RequestHandlers {
  /**
   * @description 请求前的 header 处理，如添加 token
   * @param config
   * @returns {InternalRequestConfig}
   */
  handleRequestHeader?: (config: InternalRequestConfig) => InternalRequestConfig

  /**
   * @description 全局消息提示
   * @param message
   */
  handleGlobalMessage?: (message: string) => void

  /**
   * @description 后端返回的特殊 code 码处理，例如 token 失效、需要重新登录等
   * @param code
   * @param message
   */
  handleBackendError?: (code: number, message: string) => void
}

// 拦截器配置类型
export interface HttpClientInterceptors {
  /**
   * 请求成功拦截器
   * @param config 请求配置
   * @returns 修改后的配置或一个返回配置的 Promise
   */
  requestOnFulfilled?: (
    config: InternalRequestConfig
  ) => InternalRequestConfig | Promise<InternalRequestConfig>

  /**
   * 请求失败拦截器
   * @param error 错误对象
   * @returns 一个被 reject 的 Promise
   */
  requestOnRejected?: (error: any) => any

  /**
   * 响应成功拦截器
   * @param response 响应对象
   * @returns 处理后的响应或一个返回响应的 Promise
   */
  responseOnFulfilled?: (response: AxiosResponse<ApiResponse>) => any // 返回 any，因为用户可能想直接返回 data

  /**
   * 响应失败拦截器
   * @param error 错误对象
   * @returns 一个被 reject 的 Promise
   */
  responseOnRejected?: (error: any) => any
}

export class HttpClient {
  private readonly instance: AxiosInstance
  private readonly handlers: RequestHandlers

  // 默认配置
  private static readonly defaultConfig: RequestConfig = {
    showGlobalMessage: true,
    successCode: 10000,
  }

  constructor({
    baseURL,
    axiosConfig = {},
    customInterceptors = {},
    handlers = {},
  }: HttpClientOptions) {
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
    const isSuccess = config?.successCode === res.code

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

    return res.data
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
