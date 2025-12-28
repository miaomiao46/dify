'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AppUnavailable from '../../base/app-unavailable'
import { ModelTypeEnum } from '../../header/account-setting/model-provider-page/declarations'
import StepOne from './step-one'
import StepTwo from './step-two'
import StepThree from './step-three'
import { TopBar } from './top-bar'
import type { CustomFile } from '@/models/datasets'
import { DataSourceType } from '@/models/datasets'
import type { CrawlOptions, CrawlResultItem, FileItem, createDocumentResponse } from '@/models/datasets'
import { DataSourceProvider, type NotionPage } from '@/models/common'
import { useModalContextSelector } from '@/context/modal-context'
import { useDefaultModel } from '@/app/components/header/account-setting/model-provider-page/hooks'
import { useGetDefaultDataSourceListAuth } from '@/service/use-datasource'
import { produce } from 'immer'
import { useDatasetDetailContextWithSelector } from '@/context/dataset-detail'
import Loading from '@/app/components/base/loading'
import { ACCOUNT_SETTING_TAB } from '@/app/components/header/account-setting/constants'
import { useContext } from 'use-context-selector'
import { ToastContext } from '@/app/components/base/toast'
import { fetchUnusedFiles } from '@/service/datasets'

type DatasetUpdateFormProps = {
  datasetId?: string
}

const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  crawl_sub_pages: true,
  only_main_content: true,
  includes: '',
  excludes: '',
  limit: 10,
  max_depth: '',
  use_sitemap: true,
}

const DatasetUpdateForm = ({ datasetId }: DatasetUpdateFormProps) => {
  const { t } = useTranslation()
  const setShowAccountSettingModal = useModalContextSelector(state => state.setShowAccountSettingModal)
  const { notify } = useContext(ToastContext)
  const datasetDetail = useDatasetDetailContextWithSelector(state => state.dataset)
  const { data: embeddingsDefaultModel } = useDefaultModel(ModelTypeEnum.textEmbedding)

  const [dataSourceType, setDataSourceType] = useState<DataSourceType>(DataSourceType.FILE)
  const [step, setStep] = useState(1)
  const [indexingTypeCache, setIndexTypeCache] = useState('')
  const [retrievalMethodCache, setRetrievalMethodCache] = useState('')
  const [fileList, setFiles] = useState<FileItem[]>([])
  const [result, setResult] = useState<any>()
  const [notionPages, setNotionPages] = useState<NotionPage[]>([])
  const [notionCredentialId, setNotionCredentialId] = useState<string>('')
  const [websitePages, setWebsitePages] = useState<CrawlResultItem[]>([])
  const [crawlOptions, setCrawlOptions] = useState<CrawlOptions>(DEFAULT_CRAWL_OPTIONS)
  const [websiteCrawlProvider, setWebsiteCrawlProvider] = useState<DataSourceProvider>(DataSourceProvider.jinaReader)
  const [websiteCrawlJobId, setWebsiteCrawlJobId] = useState('')
  const [initialUnusedFilesFetched, setInitialUnusedFilesFetched] = useState(false)

  const {
    data: dataSourceList,
    isLoading: isLoadingAuthedDataSourceList,
    isError: fetchingAuthedDataSourceListError,
  } = useGetDefaultDataSourceListAuth()

  const updateNotionPages = useCallback((value: NotionPage[]) => {
    setNotionPages(value)
  }, [])

  const updateNotionCredentialId = useCallback((credentialId: string) => {
    setNotionCredentialId(credentialId)
  }, [])

  const updateFileList = useCallback((preparedFiles: FileItem[]) => {
    setFiles(preparedFiles)
  }, [])

  const updateFile = useCallback((fileItem: FileItem, progress: number, list: FileItem[]) => {
    const targetIndex = list.findIndex(file => file.fileID === fileItem.fileID)
    const newList = produce(list, (draft) => {
      draft[targetIndex] = {
        ...draft[targetIndex],
        progress,
      }
    })
    setFiles(newList)
  }, [])

  const updateIndexingTypeCache = useCallback((type: string) => {
    setIndexTypeCache(type)
  }, [])

  const updateResultCache = useCallback((res?: createDocumentResponse) => {
    setResult(res)
  }, [])

  const updateRetrievalMethodCache = useCallback((method: string) => {
    setRetrievalMethodCache(method)
  }, [])

  const nextStep = useCallback(() => {
    setStep(step + 1)
  }, [step, setStep])

  const changeStep = useCallback((delta: number) => {
    setStep(step + delta)
  }, [step, setStep])

  // 获取未使用的文件
  const fetchUnusedFilesData = useCallback(async () => {
    try {
      const unusedFiles = await fetchUnusedFiles()
      // 如果有未使用的文件，显示提示
      if (unusedFiles && unusedFiles.length > 0) {
        notify({
          type: 'info',
          message: t('datasetCreation.unusedFiles.message', { count: unusedFiles.length }),
          duration: 5000,
        })

        // 将未使用的文件转换为FileItem格式
        const unusedFileItems: FileItem[] = unusedFiles.map((file: CustomFile) => ({
          fileID: file.id,
          file: {
            ...file,
            id: file.id,
            name: file.name,
            size: file.size,
            mime_type: file.mime_type,
            extension: file.extension,
          } as CustomFile,
          progress: 100,
        }))

        // 函数式更新，确保基于最新的 fileList
        setFiles((prevFiles) => {
          const existingFileIds = prevFiles.map(item => item.fileID)
          const newFileItems = unusedFileItems.filter(item => !existingFileIds.includes(item.fileID))
          return [...prevFiles, ...newFileItems]
        })
      }
    }
    catch (error) {
      console.error('获取未使用文件失败:', error)
    }
  }, [notify, t, setFiles])

  // 当step变为1时或组件首次挂载时获取未使用文件
  useEffect(() => {
    if (step === 1 && !initialUnusedFilesFetched) {
      fetchUnusedFilesData()
      setInitialUnusedFilesFetched(true)
    }
  }, [step, initialUnusedFilesFetched, fetchUnusedFilesData])

  if (fetchingAuthedDataSourceListError)
    return <AppUnavailable code={500} unknownReason={t('datasetCreation.error.unavailable') as string} />

  return (
    <div className='flex flex-col overflow-hidden bg-components-panel-bg' style={{ height: 'calc(100vh - 56px)' }}>
      <TopBar activeIndex={step - 1} datasetId={datasetId} />
      <div style={{ height: 'calc(100% - 52px)' }}>
        {
          isLoadingAuthedDataSourceList && (
            <Loading type='app' />
          )
        }
        {
          !isLoadingAuthedDataSourceList && (
            <>
              {step === 1 && (
                <StepOne
                  authedDataSourceList={dataSourceList?.result || []}
                  onSetting={() => setShowAccountSettingModal({ payload: ACCOUNT_SETTING_TAB.DATA_SOURCE })}
                  datasetId={datasetId}
                  dataSourceType={dataSourceType}
                  dataSourceTypeDisable={!!datasetDetail?.data_source_type}
                  changeType={setDataSourceType}
                  files={fileList}
                  updateFile={updateFile}
                  updateFileList={updateFileList}
                  notionPages={notionPages}
                  notionCredentialId={notionCredentialId}
                  updateNotionPages={updateNotionPages}
                  updateNotionCredentialId={updateNotionCredentialId}
                  onStepChange={nextStep}
                  websitePages={websitePages}
                  updateWebsitePages={setWebsitePages}
                  onWebsiteCrawlProviderChange={setWebsiteCrawlProvider}
                  onWebsiteCrawlJobIdChange={setWebsiteCrawlJobId}
                  crawlOptions={crawlOptions}
                  onCrawlOptionsChange={setCrawlOptions}
                />
              )}
              {(step === 2 && (!datasetId || (datasetId && !!datasetDetail))) && (
                <StepTwo
                  isAPIKeySet={!!embeddingsDefaultModel}
                  onSetting={() => setShowAccountSettingModal({ payload: ACCOUNT_SETTING_TAB.PROVIDER })}
                  indexingType={datasetDetail?.indexing_technique}
                  datasetId={datasetId}
                  dataSourceType={dataSourceType}
                  files={fileList.map(file => file.file)}
                  notionPages={notionPages}
                  notionCredentialId={notionCredentialId}
                  websitePages={websitePages}
                  websiteCrawlProvider={websiteCrawlProvider}
                  websiteCrawlJobId={websiteCrawlJobId}
                  onStepChange={changeStep}
                  updateIndexingTypeCache={updateIndexingTypeCache}
                  updateRetrievalMethodCache={updateRetrievalMethodCache}
                  updateResultCache={updateResultCache}
                  crawlOptions={crawlOptions}
                />
              )}
              {step === 3 && (
                <StepThree
                  datasetId={datasetId}
                  datasetName={datasetDetail?.name}
                  indexingType={datasetDetail?.indexing_technique || indexingTypeCache}
                  retrievalMethod={datasetDetail?.retrieval_model_dict?.search_method || retrievalMethodCache}
                  creationCache={result}
                />
              )}
            </>
          )
        }
      </div>
    </div>
  )
}

export default DatasetUpdateForm
