'use client'
import type { FC, PropsWithChildren } from 'react'
import type { DefaultModel } from '@/app/components/header/account-setting/model-provider-page/declarations'
import type { NotionPage } from '@/models/common'
import type { CrawlOptions, CrawlResultItem, CreateDocumentReq, createDocumentResponse, CustomFile, DocumentItem, FullDocumentDetail, ParentMode, PreProcessingRule, ProcessRule, Rules } from '@/models/datasets'
import type { RetrievalConfig } from '@/types/app'
import {
  RiAlertFill,
  RiArrowLeftLine,
  RiExternalLinkLine,
  RiGlobalLine,
  RiSearchEyeLine,
  RiSettings4Line,
} from '@remixicon/react'
import { noop } from 'es-toolkit/compat'
import Image from 'next/image'
import Link from 'next/link'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useContext } from 'use-context-selector'
import { trackEvent } from '@/app/components/base/amplitude'
import Badge from '@/app/components/base/badge'
import Button from '@/app/components/base/button'
import Checkbox from '@/app/components/base/checkbox'
import CustomDialog from '@/app/components/base/dialog'
import Divider from '@/app/components/base/divider'
import FloatRightContainer from '@/app/components/base/float-right-container'
import { ParentChildChunk } from '@/app/components/base/icons/src/vender/knowledge'
import { AlertTriangle } from '@/app/components/base/icons/src/vender/solid/alertsAndFeedback'
import RadioCard from '@/app/components/base/radio-card'
import { SkeletonContainer, SkeletonPoint, SkeletonRectangle, SkeletonRow } from '@/app/components/base/skeleton'
import Toast from '@/app/components/base/toast'
import Tooltip from '@/app/components/base/tooltip'
import { isReRankModelSelected } from '@/app/components/datasets/common/check-rerank-model'
import EconomicalRetrievalMethodConfig from '@/app/components/datasets/common/economical-retrieval-method-config'
import RetrievalMethodConfig from '@/app/components/datasets/common/retrieval-method-config'

import type { FC } from 'react'
import type { StepTwoProps } from './types'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Divider from '@/app/components/base/divider'
import Toast from '@/app/components/base/toast'
import { useDatasetDetailContextWithSelector } from '@/context/dataset-detail'
import { useLocale } from '@/context/i18n'
import useBreakpoints, { MediaType } from '@/hooks/use-breakpoints'
import { LanguagesSupported } from '@/i18n-config/language'
import { DataSourceProvider } from '@/models/common'
import { ChunkingMode, DataSourceType, ProcessMode } from '@/models/datasets'
import { ExternalStrategyType, SplitStrategy } from '@/models/datasets'
import { getNotionInfo, getWebsiteInfo, useCreateDocument, useCreateFirstDocument, useFetchDefaultProcessRule, useFetchFileIndexingEstimateForFile, useFetchFileIndexingEstimateForNotion, useFetchFileIndexingEstimateForWeb } from '@/service/knowledge/use-create-dataset'
import { useInvalidDatasetList } from '@/service/knowledge/use-dataset'
import { RETRIEVE_METHOD } from '@/types/app'
import { ChunkingMode, ProcessMode } from '@/models/datasets'
import { useFetchDefaultProcessRule } from '@/service/knowledge/use-create-dataset'
import { cn } from '@/utils/classnames'
import { GeneralChunkingOptions, IndexingModeSection, ParentChildOptions, PreviewPanel, StepTwoFooter } from './components'
import { IndexingType, MAXIMUM_CHUNK_TOKEN_LENGTH, useDocumentCreation, useIndexingConfig, useIndexingEstimate, usePreviewState, useSegmentationState } from './hooks'

export { IndexingType }

const StepTwo: FC<StepTwoProps> = ({
  isSetting,
  documentDetail,
  isAPIKeySet,
  datasetId,
  indexingType: propsIndexingType,
  dataSourceType: inCreatePageDataSourceType,
  files,
  notionPages = [],
  notionCredentialId,
  websitePages = [],
  crawlOptions,
  websiteCrawlProvider = DataSourceProvider.jinaReader,
  websiteCrawlJobId = '',
  onStepChange,
  updateIndexingTypeCache,
  updateResultCache,
  onSave,
  onCancel,
  updateRetrievalMethodCache,
}) => {
  const { t } = useTranslation()
  const locale = useLocale()
  const isMobile = useBreakpoints() === MediaType.mobile
  const currentDataset = useDatasetDetailContextWithSelector(s => s.dataset)
  const mutateDatasetRes = useDatasetDetailContextWithSelector(s => s.mutateDatasetRes)

  // Computed flags
  const isInUpload = Boolean(currentDataset)
  const isUploadInEmptyDataset = isInUpload && !currentDataset?.doc_form
  const isNotUploadInEmptyDataset = !isUploadInEmptyDataset
  const isInInit = !isInUpload && !isSetting
  const isInCreatePage = !datasetId || (datasetId && !currentDataset?.data_source_type)
  const dataSourceType = isInCreatePage ? inCreatePageDataSourceType : (currentDataset?.data_source_type ?? inCreatePageDataSourceType)
  const hasSetIndexType = !!propsIndexingType
  const isModelAndRetrievalConfigDisabled = !!datasetId && !!currentDataset?.data_source_type

  // External Split Strategy
  const [strategyType, setStrategyType] = useState<SplitStrategy>(SplitStrategy.internal)
  const [customStrategyUrl, setCustomStrategyUrl] = useState('')
  const [externalSplitStrategyType, setExternalSplitStrategyType] = useState<ExternalStrategyType>(ExternalStrategyType.custom_service)
  const [externalSplitStrategyApiKey, setExternalSplitStrategyApiKey] = useState('')

  const [previewFile, setPreviewFile] = useState<DocumentItem>(
    (datasetId && documentDetail)
      ? documentDetail.file
      : files[0],
  )
  const [previewNotionPage, setPreviewNotionPage] = useState<NotionPage>(
    (datasetId && documentDetail)
      ? documentDetail.notion_page
      : notionPages[0],
  )

  const [previewWebsitePage, setPreviewWebsitePage] = useState<CrawlResultItem>(
    (datasetId && documentDetail)
      ? documentDetail.website_page
      : websitePages[0],
  )

  // QA Related
  // Document form state
  const [docForm, setDocForm] = useState<ChunkingMode>((datasetId && documentDetail) ? documentDetail.doc_form as ChunkingMode : ChunkingMode.text)
  const [docLanguage, setDocLanguage] = useState<string>(() => (datasetId && documentDetail) ? documentDetail.doc_language : (locale !== LanguagesSupported[1] ? 'English' : 'Chinese Simplified'))
  const [isQAConfirmDialogOpen, setIsQAConfirmDialogOpen] = useState(false)
  const currentDocForm = currentDataset?.doc_form || docForm

  const getProcessRule = (): ProcessRule => {
    if (currentDocForm === ChunkingMode.parentChild) {
      return {
        rules: {
          pre_processing_rules: rules,
          segmentation: {
            separator: unescape(
              parentChildConfig.parent.delimiter,
            ),
            max_tokens: parentChildConfig.parent.maxLength,
          },
          parent_mode: parentChildConfig.chunkForContext,
          subchunk_segmentation: {
            separator: unescape(parentChildConfig.child.delimiter),
            max_tokens: parentChildConfig.child.maxLength,
          },
        },
        mode: 'hierarchical',
      } as ProcessRule
    }
    return {
      rules: {
        pre_processing_rules: rules,
        segmentation: {
          separator: unescape(segmentIdentifier),
          max_tokens: maxChunkLength,
          chunk_overlap: overlap,
        },
      }, // api will check this. It will be removed after api refactored.
      mode: segmentationType,
    } as ProcessRule
  }

  const fileIndexingEstimateQuery = useFetchFileIndexingEstimateForFile({
    docForm: strategyType === SplitStrategy.external ? ChunkingMode.external : currentDocForm,
    docLanguage,
    dataSourceType: DataSourceType.FILE,
    files: previewFile
      ? [files.find(file => file.name === previewFile.name)!]
      : files,
    indexingTechnique: getIndexing_technique() as any,
    processRule: getProcessRule(),
    dataset_id: datasetId!,
    split_strategy: {
      type: strategyType,
      external_strategy_desc: strategyType === SplitStrategy.external ? {
        url: customStrategyUrl,
        type: externalSplitStrategyType,
        api_key: externalSplitStrategyType === ExternalStrategyType.internal_workflow ? externalSplitStrategyApiKey : undefined,
      } : undefined,
    },
  // Custom hooks
  const segmentation = useSegmentationState({
    initialSegmentationType: currentDataset?.doc_form === ChunkingMode.parentChild ? ProcessMode.parentChild : ProcessMode.general,
    initialSummaryIndexSetting: currentDataset?.summary_index_setting,
  })
  const showSummaryIndexSetting = !currentDataset
  const indexing = useIndexingConfig({
    initialIndexType: propsIndexingType,
    initialEmbeddingModel: currentDataset?.embedding_model ? { provider: currentDataset.embedding_model_provider, model: currentDataset.embedding_model } : undefined,
    initialRetrievalConfig: currentDataset?.retrieval_model_dict,
    isAPIKeySet,
    hasSetIndexType,
  })
  const preview = usePreviewState({ dataSourceType, files, notionPages, websitePages, documentDetail, datasetId })
  const creation = useDocumentCreation({
    datasetId,
    isSetting,
    documentDetail,
    dataSourceType,
    files,
    notionPages,
    notionCredentialId,
    websitePages,
    crawlOptions,
    websiteCrawlProvider,
    websiteCrawlJobId,
    onStepChange,
    updateIndexingTypeCache,
    updateResultCache,
    updateRetrievalMethodCache,
    onSave,
    mutateDatasetRes,
  })
  const estimateHook = useIndexingEstimate({
    dataSourceType,
    datasetId,
    currentDocForm,
    docLanguage,
    files,
    previewFileName: preview.previewFile?.name,
    previewNotionPage: preview.previewNotionPage,
    notionCredentialId,
    previewWebsitePage: preview.previewWebsitePage,
    crawlOptions,
    websiteCrawlProvider,
    websiteCrawlJobId,
    indexingTechnique: indexing.getIndexingTechnique() as IndexingType,
    processRule: segmentation.getProcessRule(currentDocForm),
  })

  const currentEstimateMutation = dataSourceType === DataSourceType.FILE
    ? fileIndexingEstimateQuery
    : dataSourceType === DataSourceType.NOTION
      ? notionIndexingEstimateQuery
      : websiteIndexingEstimateQuery

  const fetchEstimate = useCallback(() => {
    if (dataSourceType === DataSourceType.FILE)
      fileIndexingEstimateQuery.mutate()

    if (dataSourceType === DataSourceType.NOTION)
      notionIndexingEstimateQuery.mutate()

    if (dataSourceType === DataSourceType.WEB)
      websiteIndexingEstimateQuery.mutate()
  }, [dataSourceType, fileIndexingEstimateQuery, notionIndexingEstimateQuery, websiteIndexingEstimateQuery])

  const estimate
    = dataSourceType === DataSourceType.FILE
      ? fileIndexingEstimateQuery.data
      : dataSourceType === DataSourceType.NOTION
        ? notionIndexingEstimateQuery.data
        : websiteIndexingEstimateQuery.data

  const getRuleName = (key: string) => {
    if (key === 'remove_extra_spaces')
      return t('datasetCreation.stepTwo.removeExtraSpaces')

    if (key === 'remove_urls_emails')
      return t('datasetCreation.stepTwo.removeUrlEmails')

    if (key === 'remove_stopwords')
      return t('datasetCreation.stepTwo.removeStopwords')

    if (key === 'enable_table_and_pic_recognition')
      return t('datasetCreation.stepTwo.enableTableAndPicRecognition')
  }
  const ruleChangeHandle = (id: string) => {
    const newRules = rules.map((rule) => {
      if (rule.id === id) {
        return {
          id: rule.id,
          enabled: !rule.enabled,
        }
      }
      return rule
    })
    setRules(newRules)
  }
  const resetRules = () => {
    if (defaultConfig) {
      setSegmentIdentifier(defaultConfig.segmentation.separator)
      setMaxChunkLength(defaultConfig.segmentation.max_tokens)
      setOverlap(defaultConfig.segmentation.chunk_overlap!)
      setRules(defaultConfig.pre_processing_rules)
    }
    setParentChildConfig(defaultParentChildConfig)
  }

  const updatePreview = () => {
    if (rules.some(rule => rule.id === 'enable_table_and_pic_recognition' && rule.enabled)) {
      Toast.notify({
        type: 'info',
        message: t('datasetCreation.stepTwo.ocrTipContent', '开启了表格和图片识别后，请您耐心等待OCR模型解析'),
      })
    }
    if (segmentationType === ProcessMode.general && maxChunkLength > MAXIMUM_CHUNK_TOKEN_LENGTH) {
      Toast.notify({ type: 'error', message: t('datasetCreation.stepTwo.maxLengthCheck', { limit: MAXIMUM_CHUNK_TOKEN_LENGTH }) })
      return
    }
    fetchEstimate()
  }

  const {
    modelList: rerankModelList,
    defaultModel: rerankDefaultModel,
    currentModel: isRerankDefaultModelValid,
  } = useModelListAndDefaultModelAndCurrentProviderAndModel(ModelTypeEnum.rerank)
  const { data: embeddingModelList } = useModelList(ModelTypeEnum.textEmbedding)
  const { data: defaultEmbeddingModel } = useDefaultModel(ModelTypeEnum.textEmbedding)
  const [embeddingModel, setEmbeddingModel] = useState<DefaultModel>(
    currentDataset?.embedding_model
      ? {
          provider: currentDataset.embedding_model_provider,
          model: currentDataset.embedding_model,
        }
      : {
          provider: defaultEmbeddingModel?.provider.provider || '',
          model: defaultEmbeddingModel?.model || '',
        },
  )
  const [retrievalConfig, setRetrievalConfig] = useState(currentDataset?.retrieval_model_dict || {
    search_method: RETRIEVE_METHOD.semantic,
    reranking_enable: false,
    reranking_model: {
      reranking_provider_name: '',
      reranking_model_name: '',
    },
    top_k: 3,
    score_threshold_enabled: false,
    score_threshold: 0.5,
  } as RetrievalConfig)

  useEffect(() => {
    if (currentDataset?.retrieval_model_dict)
      return
    setRetrievalConfig({
      search_method: RETRIEVE_METHOD.semantic,
      reranking_enable: !!isRerankDefaultModelValid,
      reranking_model: {
        reranking_provider_name: isRerankDefaultModelValid ? rerankDefaultModel?.provider.provider ?? '' : '',
        reranking_model_name: isRerankDefaultModelValid ? rerankDefaultModel?.model ?? '' : '',
      },
      top_k: 3,
      score_threshold_enabled: false,
      score_threshold: 0.5,
    })
  }, [rerankDefaultModel, isRerankDefaultModelValid])

  const getCreationParams = () => {
    let params
    if (segmentationType === ProcessMode.general && overlap > maxChunkLength) {
      Toast.notify({ type: 'error', message: t('datasetCreation.stepTwo.overlapCheck') })
      return
    }
    if (segmentationType === ProcessMode.general && maxChunkLength > limitMaxChunkLength) {
      Toast.notify({ type: 'error', message: t('datasetCreation.stepTwo.maxLengthCheck', { limit: limitMaxChunkLength }) })
      return
    }
    if (isSetting) {
      params = {
        original_document_id: documentDetail?.id,
        doc_form: currentDocForm,
        doc_language: docLanguage,
        process_rule: getProcessRule(),
        retrieval_model: retrievalConfig, // Readonly. If want to changed, just go to settings page.
        embedding_model: embeddingModel.model, // Readonly
        embedding_model_provider: embeddingModel.provider, // Readonly
        indexing_technique: getIndexing_technique(),
      } as CreateDocumentReq
    }
    else { // create
      const indexMethod = getIndexing_technique()
      if (indexMethod === IndexingType.QUALIFIED && (!embeddingModel.model || !embeddingModel.provider)) {
        Toast.notify({
          type: 'error',
          message: t('appDebug.datasetConfig.embeddingModelRequired'),
        })
        return
      }
      if (
        !isReRankModelSelected({
          rerankModelList,
          retrievalConfig,
          indexMethod: indexMethod as string,
        })
      ) {
        Toast.notify({ type: 'error', message: t('appDebug.datasetConfig.rerankModelRequired') })
        return
      }
      params = {
        data_source: {
          type: dataSourceType,
          info_list: {
            data_source_type: dataSourceType,
          },
        },
        indexing_technique: getIndexing_technique(),
        process_rule: getProcessRule(),
        doc_form: currentDocForm,
        doc_language: docLanguage,
        retrieval_model: retrievalConfig,
        embedding_model: embeddingModel.model,
        embedding_model_provider: embeddingModel.provider,
      } as CreateDocumentReq
      if (dataSourceType === DataSourceType.FILE) {
        params.data_source.info_list.file_info_list = {
          file_ids: files.map(file => file.id || '').filter(Boolean),
        }
      }
      if (dataSourceType === DataSourceType.NOTION)
        params.data_source.info_list.notion_info_list = getNotionInfo(notionPages, notionCredentialId)

      if (dataSourceType === DataSourceType.WEB) {
        params.data_source.info_list.website_info_list = getWebsiteInfo({
          websiteCrawlProvider,
          websiteCrawlJobId,
          websitePages,
        })
      }

      if (strategyType === SplitStrategy.external) {
        params.split_strategy = {
          type: strategyType,
          external_strategy_desc: {
            url: customStrategyUrl,
            type: ExternalStrategyType.custom_service,
          },
        }
      }
    }
    return params
  }

  // Fetch default process rule
  const fetchDefaultProcessRuleMutation = useFetchDefaultProcessRule({
    onSuccess(data) {
      segmentation.setSegmentIdentifier(data.rules.segmentation.separator)
      segmentation.setMaxChunkLength(data.rules.segmentation.max_tokens)
      segmentation.setOverlap(data.rules.segmentation.chunk_overlap!)
      segmentation.setRules(data.rules.pre_processing_rules)
      segmentation.setDefaultConfig(data.rules)
      segmentation.setLimitMaxChunkLength(data.limits.indexing_max_segmentation_tokens_length)
    },
  })

  // Event handlers
  const handleDocFormChange = useCallback((value: ChunkingMode) => {
    if (value === ChunkingMode.qa && indexing.indexType === IndexingType.ECONOMICAL) {
      setIsQAConfirmDialogOpen(true)
      return
    }
    if (value === ChunkingMode.parentChild && indexing.indexType === IndexingType.ECONOMICAL)
      indexing.setIndexType(IndexingType.QUALIFIED)
    setDocForm(value)
    segmentation.setSegmentationType(value === ChunkingMode.parentChild ? ProcessMode.parentChild : ProcessMode.general)
    estimateHook.reset()
  }, [indexing, segmentation, estimateHook])

  const updatePreview = useCallback(() => {
    if (segmentation.segmentationType === ProcessMode.general && segmentation.maxChunkLength > MAXIMUM_CHUNK_TOKEN_LENGTH) {
      Toast.notify({ type: 'error', message: t('stepTwo.maxLengthCheck', { ns: 'datasetCreation', limit: MAXIMUM_CHUNK_TOKEN_LENGTH }) })
      return
    }
    estimateHook.fetchEstimate()
  }, [segmentation, t, estimateHook])

  const handleCreate = useCallback(async () => {
    const isValid = creation.validateParams({
      segmentationType: segmentation.segmentationType,
      maxChunkLength: segmentation.maxChunkLength,
      limitMaxChunkLength: segmentation.limitMaxChunkLength,
      overlap: segmentation.overlap,
      indexType: indexing.indexType,
      embeddingModel: indexing.embeddingModel,
      rerankModelList: indexing.rerankModelList,
      retrievalConfig: indexing.retrievalConfig,
    })
    if (!isValid)
      return
    const params = creation.buildCreationParams(currentDocForm, docLanguage, segmentation.getProcessRule(currentDocForm), indexing.retrievalConfig, indexing.embeddingModel, indexing.getIndexingTechnique(), segmentation.summaryIndexSetting)
    if (!params)
      return
    await creation.executeCreation(params, indexing.indexType, indexing.retrievalConfig)
  }, [creation, segmentation, indexing, currentDocForm, docLanguage])

  const handlePickerChange = useCallback((selected: { id: string, name: string }) => {
    estimateHook.reset()
    preview.handlePreviewChange(selected)
    estimateHook.fetchEstimate()
  }, [estimateHook, preview])

  const handleQAConfirm = useCallback(() => {
    setIsQAConfirmDialogOpen(false)
    indexing.setIndexType(IndexingType.QUALIFIED)
    setDocForm(ChunkingMode.qa)
  }, [indexing])

  // Initialize rules
  useEffect(() => {
    if (!isSetting) {
      fetchDefaultProcessRuleMutation.mutate('/datasets/process-rule')
    }
    else if (documentDetail) {
      const rules = documentDetail.dataset_process_rule.rules
      const isHierarchical = documentDetail.doc_form === ChunkingMode.parentChild || Boolean(rules.parent_mode && rules.subchunk_segmentation)
      segmentation.applyConfigFromRules(rules, isHierarchical)
      segmentation.setSegmentationType(documentDetail.dataset_process_rule.mode)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Show options conditions
  const showGeneralOption = (isInUpload && [ChunkingMode.text, ChunkingMode.qa].includes(currentDataset!.doc_form)) || isUploadInEmptyDataset || isInInit
  const showParentChildOption = (isInUpload && currentDataset!.doc_form === ChunkingMode.parentChild) || isUploadInEmptyDataset || isInInit

  return (
    <div className="flex h-full w-full">
      <div className={cn('relative h-full w-1/2 overflow-y-auto py-6', isMobile ? 'px-4' : 'px-12')}>
        <div className="system-md-semibold mb-1 text-text-secondary">{t('datasetCreation.stepTwo.segmentation')}</div>
        {/* 新增：策略类型选择 */}
        <div className='mb-4'>
          <div className='flex items-center gap-x-2'>
            <div className='inline-flex shrink-0'>
              <TextLabel>{t('datasetCreation.stepTwo.strategyType')}</TextLabel>
            </div>
            <Divider className='grow' bgStyle='gradient' />
          </div>
          <div className='mt-2 flex gap-2'>
            <RadioCard
              className='flex-1'
              icon={<RiSettings4Line className='h-4 w-4' />}
              title={t('datasetCreation.stepTwo.builtInStrategy')}
              description={t('datasetCreation.stepTwo.builtInStrategyTip')}
              isChosen={strategyType === SplitStrategy.internal}
              onChosen={() => {
                setStrategyType(SplitStrategy.internal)
                handleChangeDocform(ChunkingMode.text)
              }}
            />
            <RadioCard
              className='flex-1'
              icon={<RiGlobalLine className='h-4 w-4' />}
              title={t('datasetCreation.stepTwo.customStrategy')}
              description={t('datasetCreation.stepTwo.customStrategyTip')}
              isChosen={strategyType === SplitStrategy.external}
              onChosen={() => {
                setStrategyType(SplitStrategy.external)
                handleChangeDocform(ChunkingMode.external)
              }}
            />
          </div>
        </div>

        {/* 修改：添加条件渲染 */}
        {strategyType === SplitStrategy.internal ? (
          <>
              {((isInUpload && [ChunkingMode.text, ChunkingMode.qa].includes(currentDataset!.doc_form))
                || isUploadInEmptyDataset
                || isInInit)
              && (
                <OptionCard
                  className="mb-2 bg-background-section"
                  title={t('datasetCreation.stepTwo.general')}
                  icon={<Image width={20} height={20} src={SettingCog} alt={t('datasetCreation.stepTwo.general')} />}
                  activeHeaderClassName="bg-dataset-option-card-blue-gradient"
                  description={t('datasetCreation.stepTwo.generalTip')}
                  isActive={
                    [ChunkingMode.text, ChunkingMode.qa].includes(currentDocForm)
                  }
                  onSwitched={() =>
                    handleChangeDocform(ChunkingMode.text)}
                  actions={(
                    <>
                      <Button variant="secondary-accent" onClick={() => updatePreview()}>
                        <RiSearchEyeLine className="mr-0.5 h-4 w-4" />
                        {t('datasetCreation.stepTwo.previewChunk')}
                      </Button>
                      <Button variant="ghost" onClick={resetRules}>
                        {t('datasetCreation.stepTwo.reset')}
                      </Button>
                    </>
                  )}
                  noHighlight={isInUpload && isNotUploadInEmptyDataset}
                >
                  <div className="flex flex-col gap-y-4">
                    <div className="flex gap-3">
                      <DelimiterInput
                        value={segmentIdentifier}
                        onChange={e => setSegmentIdentifier(e.target.value, true)}
                      />
                      <MaxLengthInput
                        unit="characters"
                        value={maxChunkLength}
                        onChange={setMaxChunkLength}
                      />
                      <OverlapInput
                        unit="characters"
                        value={overlap}
                        min={1}
                        onChange={setOverlap}
                      />
                    </div>
                    <div className="flex w-full flex-col">
                      <div className="flex items-center gap-x-2">
                        <div className="inline-flex shrink-0">
                          <TextLabel>{t('datasetCreation.stepTwo.rules')}</TextLabel>
                        </div>
                        <Divider className="grow" bgStyle="gradient" />
                      </div>
                      <div className="mt-1">
                        {rules.map(rule => (
                          <div
                            key={rule.id}
                            className={s.ruleItem}
                            onClick={() => {
                              ruleChangeHandle(rule.id)
                            }}
                          >
                            <Checkbox
                              checked={rule.enabled}
                            />
                            <label className="system-sm-regular ml-2 cursor-pointer text-text-secondary">{getRuleName(rule.id)}</label>
                          </div>
                        ))}
                        {IS_CE_EDITION && (
                          <>
                            <Divider type="horizontal" className="my-4 bg-divider-subtle" />
                            <div className="flex items-center py-0.5">
                              <div
                                className="flex items-center"
                                onClick={() => {
                                  if (currentDataset?.doc_form)
                                    return
                                  if (docForm === ChunkingMode.qa)
                                    handleChangeDocform(ChunkingMode.text)
                                  else
                                    handleChangeDocform(ChunkingMode.qa)
                                }}
                              >
                                <Checkbox
                                  checked={currentDocForm === ChunkingMode.qa}
                                  disabled={!!currentDataset?.doc_form}
                                />
                                <label className="system-sm-regular ml-2 cursor-pointer text-text-secondary">
                                  {t('datasetCreation.stepTwo.useQALanguage')}
                                </label>
                              </div>
                              <LanguageSelect
                                currentLanguage={docLanguage || locale}
                                onSelect={setDocLanguage}
                                disabled={currentDocForm !== ChunkingMode.qa}
                              />
                              <Tooltip popupContent={t('datasetCreation.stepTwo.QATip')} />
                            </div>
                            {currentDocForm === ChunkingMode.qa && (
                              <div
                                style={{
                                  background: 'linear-gradient(92deg, rgba(247, 144, 9, 0.1) 0%, rgba(255, 255, 255, 0.00) 100%)',
                                }}
                                className="mt-2 flex h-10 items-center gap-2 rounded-xl border border-components-panel-border px-3 text-xs shadow-xs backdrop-blur-[5px]"
                              >
                                <RiAlertFill className="size-4 text-text-warning-secondary" />
                                <span className="system-xs-medium text-text-primary">
                                  {t('datasetCreation.stepTwo.QATip')}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </OptionCard>
              )}
              {
                (
                  (isInUpload && currentDataset!.doc_form === ChunkingMode.parentChild)
                  || isUploadInEmptyDataset
                  || isInInit
                )
                && (
                  <OptionCard
                    title={t('datasetCreation.stepTwo.parentChild')}
                    icon={<ParentChildChunk className="h-[20px] w-[20px]" />}
                    effectImg={BlueEffect.src}
                    className="text-util-colors-blue-light-blue-light-500"
                    activeHeaderClassName="bg-dataset-option-card-blue-gradient"
                    description={t('datasetCreation.stepTwo.parentChildTip')}
                    isActive={currentDocForm === ChunkingMode.parentChild}
                    onSwitched={() => handleChangeDocform(ChunkingMode.parentChild)}
                    actions={(
                      <>
                        <Button variant="secondary-accent" onClick={() => updatePreview()}>
                          <RiSearchEyeLine className="mr-0.5 h-4 w-4" />
                          {t('datasetCreation.stepTwo.previewChunk')}
                        </Button>
                        <Button variant="ghost" onClick={resetRules}>
                          {t('datasetCreation.stepTwo.reset')}
                        </Button>
                      </>
                    )}
                    noHighlight={isInUpload && isNotUploadInEmptyDataset}
                  >
                    <div className="flex flex-col gap-4">
                      <div>
                        <div className="flex items-center gap-x-2">
                          <div className="inline-flex shrink-0">
                            <TextLabel>{t('datasetCreation.stepTwo.parentChunkForContext')}</TextLabel>
                          </div>
                          <Divider className="grow" bgStyle="gradient" />
                        </div>
                        <RadioCard
                          className="mt-1"
                          icon={<Image src={Note} alt="" />}
                          title={t('datasetCreation.stepTwo.paragraph')}
                          description={t('datasetCreation.stepTwo.paragraphTip')}
                          isChosen={parentChildConfig.chunkForContext === 'paragraph'}
                          onChosen={() => setParentChildConfig(
                            {
                              ...parentChildConfig,
                              chunkForContext: 'paragraph',
                            },
                          )}
                          chosenConfig={(
                            <div className="flex gap-3">
                              <DelimiterInput
                                value={parentChildConfig.parent.delimiter}
                                tooltip={t('datasetCreation.stepTwo.parentChildDelimiterTip')!}
                                onChange={e => setParentChildConfig({
                                  ...parentChildConfig,
                                  parent: {
                                    ...parentChildConfig.parent,
                                    delimiter: e.target.value ? escape(e.target.value) : '',
                                  },
                                })}
                              />
                              <MaxLengthInput
                                unit="characters"
                                value={parentChildConfig.parent.maxLength}
                                onChange={value => setParentChildConfig({
                                  ...parentChildConfig,
                                  parent: {
                                    ...parentChildConfig.parent,
                                    maxLength: value,
                                  },
                                })}
                              />
                            </div>
                          )}
                        />
                        <RadioCard
                          className="mt-2"
                          icon={<Image src={FileList} alt="" />}
                          title={t('datasetCreation.stepTwo.fullDoc')}
                          description={t('datasetCreation.stepTwo.fullDocTip')}
                          onChosen={() => setParentChildConfig(
                            {
                              ...parentChildConfig,
                              chunkForContext: 'full-doc',
                            },
                          )}
                          isChosen={parentChildConfig.chunkForContext === 'full-doc'}
                        />
                      </div>

                      <div>
                        <div className="flex items-center gap-x-2">
                          <div className="inline-flex shrink-0">
                            <TextLabel>{t('datasetCreation.stepTwo.childChunkForRetrieval')}</TextLabel>
                          </div>
                          <Divider className="grow" bgStyle="gradient" />
                        </div>
                        <div className="mt-1 flex gap-3">
                          <DelimiterInput
                            value={parentChildConfig.child.delimiter}
                            tooltip={t('datasetCreation.stepTwo.parentChildChunkDelimiterTip')!}
                            onChange={e => setParentChildConfig({
                              ...parentChildConfig,
                              child: {
                                ...parentChildConfig.child,
                                delimiter: e.target.value ? escape(e.target.value) : '',
                              },
                            })}
                          />
                          <MaxLengthInput
                            unit="characters"
                            value={parentChildConfig.child.maxLength}
                            onChange={value => setParentChildConfig({
                              ...parentChildConfig,
                              child: {
                                ...parentChildConfig.child,
                                maxLength: value,
                              },
                            })}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-x-2">
                          <div className="inline-flex shrink-0">
                            <TextLabel>{t('datasetCreation.stepTwo.rules')}</TextLabel>
                          </div>
                          <Divider className="grow" bgStyle="gradient" />
                        </div>
                        <div className="mt-1">
                          {rules.map(rule => (
                            <div
                              key={rule.id}
                              className={s.ruleItem}
                              onClick={() => {
                                ruleChangeHandle(rule.id)
                              }}
                            >
                              <Checkbox
                                checked={rule.enabled}
                              />
                              <label className="system-sm-regular ml-2 cursor-pointer text-text-secondary">{getRuleName(rule.id)}</label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </OptionCard>
                )
              }
          </>
        ) : (
          /* 新增：自定义策略配置 */
          <OptionCard
            className='mb-2 bg-background-section'
            title={t('datasetCreation.stepTwo.customStrategy')}
            icon={<RiGlobalLine className='h-5 w-5' />}
            activeHeaderClassName='bg-dataset-option-card-blue-gradient'
            description={t('datasetCreation.stepTwo.customStrategyTip')}
            isActive={true}
            actions={
              <>
                <Button variant={'secondary-accent'} onClick={() => updatePreview()}>
                  <RiSearchEyeLine className='mr-0.5 h-4 w-4' />
                  {t('datasetCreation.stepTwo.previewChunk')}
                </Button>
              </>
            }
          >
            <div className='flex flex-col gap-y-4'>
              <div className='flex flex-col gap-2'>
                <div className='flex items-center justify-between'>
                  <TextLabel>{t('datasetCreation.stepTwo.customStrategyUrl')}</TextLabel>
                  <Link
                    href="http://agile.cffex.net/confluence/pages/viewpage.action?pageId=98469434"
                    target='_blank'
                    rel='noopener noreferrer'
                    className='hover:text-text-accent-hover flex items-center text-xs text-text-accent'
                  >
                    <RiExternalLinkLine className='mr-0.5 h-3 w-3' />
                    {t('datasetCreation.stepTwo.customStrategyDocsLearnMore')}
                  </Link>
                </div>
                <input
                  type="text"
                  value={customStrategyUrl}
                  onChange={e => setCustomStrategyUrl(e.target.value)}
                  placeholder={t('datasetCreation.stepTwo.customStrategyUrlPlaceholder')}
                  className='h-9 rounded-lg border border-components-panel-border bg-components-panel-bg px-3 text-sm'
                />
              </div>
              <div className='flex flex-col gap-2'>
                <div className='flex items-center py-0.5'>
                  <div className='flex items-center' onClick={() => {
                    if (strategyType !== SplitStrategy.external) {
                      setExternalSplitStrategyType(
                        externalSplitStrategyType === ExternalStrategyType.internal_workflow
                          ? ExternalStrategyType.custom_service
                          : ExternalStrategyType.internal_workflow,
                      )
                    }
                  }}>
                    <Checkbox
                      checked={externalSplitStrategyType === ExternalStrategyType.internal_workflow}
                      disabled={strategyType === SplitStrategy.external}
                    />
                    <label className={cn('system-sm-regular ml-2 cursor-pointer text-text-secondary',
                      strategyType === SplitStrategy.external && 'cursor-not-allowed opacity-50')}>
                      {t('datasetCreation.stepTwo.useInternalWorkflow')}
                    </label>
                  </div>
                </div>
                {externalSplitStrategyType === ExternalStrategyType.internal_workflow && (
                  <div className='flex flex-col gap-2'>
                    <TextLabel>{t('datasetCreation.stepTwo.apiKey')}</TextLabel>
                    <input
                      type="password"
                      value={externalSplitStrategyApiKey}
                      onChange={e => setExternalSplitStrategyApiKey(e.target.value)}
                      placeholder={t('datasetCreation.stepTwo.apiKeyPlaceholder')}
                      className='h-9 rounded-lg border border-components-panel-border bg-components-panel-bg px-3 text-sm'
                      disabled={strategyType === SplitStrategy.external}
                    />
                  </div>
                )}
              </div>
            </div>
          </OptionCard>
        )}
        <Divider className="my-5" />
        <div className="system-md-semibold mb-1 text-text-secondary">{t('datasetCreation.stepTwo.indexMode')}</div>
        <div className="flex items-center gap-2">
          {(!hasSetIndexType || (hasSetIndexType && indexingType === IndexingType.QUALIFIED)) && (
            <OptionCard
              className="flex-1 self-stretch"
              title={(
                <div className="flex items-center">
                  {t('datasetCreation.stepTwo.qualified')}
                  <Badge className={cn('ml-1 h-[18px]', (!hasSetIndexType && indexType === IndexingType.QUALIFIED) ? 'border-text-accent-secondary text-text-accent-secondary' : '')} uppercase>
                    {t('datasetCreation.stepTwo.recommend')}
                  </Badge>
                  <span className="ml-auto">
                    {!hasSetIndexType && <span className={cn(s.radio)} />}
                  </span>
                </div>
              )}
              description={t('datasetCreation.stepTwo.qualifiedTip')}
              icon={<Image src={indexMethodIcon.high_quality} alt="" />}
              isActive={!hasSetIndexType && indexType === IndexingType.QUALIFIED}
              disabled={hasSetIndexType}
              onSwitched={() => {
                setIndexType(IndexingType.QUALIFIED)
              }}
            />
          )}

          {(!hasSetIndexType || (hasSetIndexType && indexingType === IndexingType.ECONOMICAL)) && (
            <>
              <CustomDialog show={isQAConfirmDialogOpen} onClose={() => setIsQAConfirmDialogOpen(false)} className="w-[432px]">
                <header className="mb-4 pt-6">
                  <h2 className="text-lg font-semibold text-text-primary">
                    {t('datasetCreation.stepTwo.qaSwitchHighQualityTipTitle')}
                  </h2>
                  <p className="mt-2 text-sm font-normal text-text-secondary">
                    {t('datasetCreation.stepTwo.qaSwitchHighQualityTipContent')}
                  </p>
                </header>
                <div className="flex gap-2 pb-6">
                  <Button
                    className="ml-auto"
                    onClick={() => {
                      setIsQAConfirmDialogOpen(false)
                    }}
                  >
                    {t('datasetCreation.stepTwo.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setIsQAConfirmDialogOpen(false)
                      setIndexType(IndexingType.QUALIFIED)
                      setDocForm(ChunkingMode.qa)
                    }}
                  >
                    {t('datasetCreation.stepTwo.switch')}
                  </Button>
                </div>
              </CustomDialog>
              <Tooltip
                popupContent={(
                  <div className="rounded-lg border-components-panel-border bg-components-tooltip-bg p-3 text-xs font-medium text-text-secondary shadow-lg">
                    {
                      docForm === ChunkingMode.qa
                        ? t('datasetCreation.stepTwo.notAvailableForQA')
                        : t('datasetCreation.stepTwo.notAvailableForParentChild')
                    }
                  </div>
                )}
                noDecoration
                position="top"
                asChild={false}
                triggerClassName="flex-1 self-stretch"
              >
                <OptionCard
                  className="h-full"
                  title={t('datasetCreation.stepTwo.economical')}
                  description={t('datasetCreation.stepTwo.economicalTip')}
                  icon={<Image src={indexMethodIcon.economical} alt="" />}
                  isActive={!hasSetIndexType && indexType === IndexingType.ECONOMICAL}
                  disabled={hasSetIndexType || docForm !== ChunkingMode.text}
                  onSwitched={() => {
                    setIndexType(IndexingType.ECONOMICAL)
                  }}
                />
              </Tooltip>
            </>
          )}
        </div>
        {!hasSetIndexType && indexType === IndexingType.QUALIFIED && (
          <div className="mt-2 flex h-10 items-center gap-x-0.5 overflow-hidden rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg-blur p-2 shadow-xs backdrop-blur-[5px]">
            <div className="absolute bottom-0 left-0 right-0 top-0 bg-dataset-warning-message-bg opacity-40"></div>
            <div className="p-1">
              <AlertTriangle className="size-4 text-text-warning-secondary" />
            </div>
            <span className="system-xs-medium text-text-primary">{t('datasetCreation.stepTwo.highQualityTip')}</span>
          </div>
        )}
        {hasSetIndexType && indexType === IndexingType.ECONOMICAL && (
          <div className="system-xs-medium mt-2 text-text-tertiary">
            {t('datasetCreation.stepTwo.indexSettingTip')}
            <Link className="text-text-accent" href={`/datasets/${datasetId}/settings`}>{t('datasetCreation.stepTwo.datasetSettingLink')}</Link>
          </div>
        )}
        {/* Embedding model */}
        {indexType === IndexingType.QUALIFIED && (
          <div className="mt-5">
            <div className={cn('system-md-semibold mb-1 text-text-secondary', datasetId && 'flex items-center justify-between')}>{t('datasetSettings.form.embeddingModel')}</div>
            <ModelSelector
              readonly={isModelAndRetrievalConfigDisabled}
              triggerClassName={isModelAndRetrievalConfigDisabled ? 'opacity-50' : ''}
              defaultModel={embeddingModel}
              modelList={embeddingModelList}
              onSelect={(model: DefaultModel) => {
                setEmbeddingModel(model)
              }}
            />
            {isModelAndRetrievalConfigDisabled && (
              <div className="system-xs-medium mt-2 text-text-tertiary">
                {t('datasetCreation.stepTwo.indexSettingTip')}
                <Link className="text-text-accent" href={`/datasets/${datasetId}/settings`}>{t('datasetCreation.stepTwo.datasetSettingLink')}</Link>
              </div>
            )}
          </div>
        <div className="system-md-semibold mb-1 text-text-secondary">{t('stepTwo.segmentation', { ns: 'datasetCreation' })}</div>
        {showGeneralOption && (
          <GeneralChunkingOptions
            segmentIdentifier={segmentation.segmentIdentifier}
            maxChunkLength={segmentation.maxChunkLength}
            overlap={segmentation.overlap}
            rules={segmentation.rules}
            currentDocForm={currentDocForm}
            docLanguage={docLanguage}
            isActive={[ChunkingMode.text, ChunkingMode.qa].includes(currentDocForm)}
            isInUpload={isInUpload}
            isNotUploadInEmptyDataset={isNotUploadInEmptyDataset}
            hasCurrentDatasetDocForm={!!currentDataset?.doc_form}
            onSegmentIdentifierChange={value => segmentation.setSegmentIdentifier(value, true)}
            onMaxChunkLengthChange={segmentation.setMaxChunkLength}
            onOverlapChange={segmentation.setOverlap}
            onRuleToggle={segmentation.toggleRule}
            onDocFormChange={handleDocFormChange}
            onDocLanguageChange={setDocLanguage}
            onPreview={updatePreview}
            onReset={segmentation.resetToDefaults}
            locale={locale}
            showSummaryIndexSetting={showSummaryIndexSetting}
            summaryIndexSetting={segmentation.summaryIndexSetting}
            onSummaryIndexSettingChange={segmentation.handleSummaryIndexSettingChange}
          />
        )}
        {showParentChildOption && (
          <ParentChildOptions
            parentChildConfig={segmentation.parentChildConfig}
            rules={segmentation.rules}
            currentDocForm={currentDocForm}
            isActive={currentDocForm === ChunkingMode.parentChild}
            isInUpload={isInUpload}
            isNotUploadInEmptyDataset={isNotUploadInEmptyDataset}
            onDocFormChange={handleDocFormChange}
            onChunkForContextChange={segmentation.setChunkForContext}
            onParentDelimiterChange={v => segmentation.updateParentConfig('delimiter', v)}
            onParentMaxLengthChange={v => segmentation.updateParentConfig('maxLength', v)}
            onChildDelimiterChange={v => segmentation.updateChildConfig('delimiter', v)}
            onChildMaxLengthChange={v => segmentation.updateChildConfig('maxLength', v)}
            onRuleToggle={segmentation.toggleRule}
            onPreview={updatePreview}
            onReset={segmentation.resetToDefaults}
            showSummaryIndexSetting={showSummaryIndexSetting}
            summaryIndexSetting={segmentation.summaryIndexSetting}
            onSummaryIndexSettingChange={segmentation.handleSummaryIndexSettingChange}
          />
        )}
        <Divider className="my-5" />
        <IndexingModeSection
          indexType={indexing.indexType}
          hasSetIndexType={hasSetIndexType}
          docForm={docForm}
          embeddingModel={indexing.embeddingModel}
          embeddingModelList={indexing.embeddingModelList}
          retrievalConfig={indexing.retrievalConfig}
          showMultiModalTip={indexing.showMultiModalTip}
          isModelAndRetrievalConfigDisabled={isModelAndRetrievalConfigDisabled}
          datasetId={datasetId}
          isQAConfirmDialogOpen={isQAConfirmDialogOpen}
          onIndexTypeChange={indexing.setIndexType}
          onEmbeddingModelChange={indexing.setEmbeddingModel}
          onRetrievalConfigChange={indexing.setRetrievalConfig}
          onQAConfirmDialogClose={() => setIsQAConfirmDialogOpen(false)}
          onQAConfirmDialogConfirm={handleQAConfirm}
        />
        <StepTwoFooter isSetting={isSetting} isCreating={creation.isCreating} onPrevious={() => onStepChange?.(-1)} onCreate={handleCreate} onCancel={onCancel} />
      </div>
      <FloatRightContainer isMobile={isMobile} isOpen={true} onClose={noop} footer={null}>
        <PreviewContainer
          header={(
            <PreviewHeader
              title={t('datasetCreation.stepTwo.preview')}
            >
              <div className="flex items-center gap-1">
                {dataSourceType === DataSourceType.FILE
                  && (
                    <PreviewDocumentPicker
                      files={files as Array<Required<CustomFile>>}
                      onChange={(selected) => {
                        currentEstimateMutation.reset()
                        setPreviewFile(selected)
                        currentEstimateMutation.mutate()
                      }}
                      // when it is from setting, it just has one file
                      value={isSetting ? (files[0]! as Required<CustomFile>) : previewFile}
                    />
                  )}
                {dataSourceType === DataSourceType.NOTION
                  && (
                    <PreviewDocumentPicker
                      files={
                        notionPages.map(page => ({
                          id: page.page_id,
                          name: page.page_name,
                          extension: 'md',
                        }))
                      }
                      onChange={(selected) => {
                        currentEstimateMutation.reset()
                        const selectedPage = notionPages.find(page => page.page_id === selected.id)
                        setPreviewNotionPage(selectedPage!)
                        currentEstimateMutation.mutate()
                      }}
                      value={{
                        id: previewNotionPage?.page_id || '',
                        name: previewNotionPage?.page_name || '',
                        extension: 'md',
                      }}
                    />
                  )}
                {dataSourceType === DataSourceType.WEB
                  && (
                    <PreviewDocumentPicker
                      files={
                        websitePages.map(page => ({
                          id: page.source_url,
                          name: page.title,
                          extension: 'md',
                        }))
                      }
                      onChange={(selected) => {
                        currentEstimateMutation.reset()
                        const selectedPage = websitePages.find(page => page.source_url === selected.id)
                        setPreviewWebsitePage(selectedPage!)
                        currentEstimateMutation.mutate()
                      }}
                      value={
                        {
                          id: previewWebsitePage?.source_url || '',
                          name: previewWebsitePage?.title || '',
                          extension: 'md',
                        }
                      }
                    />
                  )}
                {
                  currentDocForm !== ChunkingMode.qa
                  && (
                    <Badge text={t('datasetCreation.stepTwo.previewChunkCount', {
                      count: estimate?.total_segments || 0,
                    }) as string}
                    />
                  )
                }
              </div>
            </PreviewHeader>
          )}
          className={cn('relative flex h-full w-1/2 shrink-0 p-4 pr-0', isMobile && 'w-full max-w-[524px]')}
          mainClassName="space-y-6"
        >
          {currentDocForm === ChunkingMode.qa && estimate?.qa_preview && (
            estimate?.qa_preview.map((item, index) => (
              <ChunkContainer
                key={item.question}
                label={`Chunk-${index + 1}`}
                characterCount={item.question.length + item.answer.length}
              >
                <QAPreview qa={item} />
              </ChunkContainer>
            ))
          )}
          {currentDocForm === ChunkingMode.text && estimate?.preview && (
            estimate?.preview.map((item, index) => (
              <ChunkContainer
                key={item.content}
                label={`Chunk-${index + 1}`}
                characterCount={item.content.length}
              >
                {item.content}
              </ChunkContainer>
            ))
          )}
          {currentDocForm === ChunkingMode.parentChild && currentEstimateMutation.data?.preview && (
            estimate?.preview?.map((item, index) => {
              const indexForLabel = index + 1
              const childChunks = parentChildConfig.chunkForContext === 'full-doc'
                ? item.child_chunks.slice(0, FULL_DOC_PREVIEW_LENGTH)
                : item.child_chunks
              return (
                <ChunkContainer
                  key={item.content}
                  label={`Chunk-${indexForLabel}`}
                  characterCount={item.content.length}
                >
                  <FormattedText>
                    {childChunks.map((child, index) => {
                      const indexForLabel = index + 1
                      return (
                        <PreviewSlice
                          key={`C-${indexForLabel}-${child}`}
                          label={`C-${indexForLabel}`}
                          text={child}
                          tooltip={`Child-chunk-${indexForLabel} · ${child.length} Characters`}
                          labelInnerClassName="text-[10px] font-semibold align-bottom leading-7"
                          dividerClassName="leading-7"
                        />
                      )
                    })}
                  </FormattedText>
                </ChunkContainer>
              )
            })
          )}
          {/* 新增：外部策略预览 */}
          {currentDocForm === ChunkingMode.external && estimate?.preview && (
            estimate?.preview.map((item, index) => {
              return (
                <ChunkContainer
                  key={item.content || `chunk-${index}`}
                  label={`Chunk-${index + 1}`}
                  characterCount={item.content?.length || 0}
                >
                  {item.content || '内容为空'}
                </ChunkContainer>
              )
            })
          )}
          {currentEstimateMutation.isIdle && (
            <div className="flex h-full w-full items-center justify-center">
              <div className="flex flex-col items-center justify-center gap-3">
                <RiSearchEyeLine className="size-10 text-text-empty-state-icon" />
                <p className="text-sm text-text-tertiary">
                  {t('datasetCreation.stepTwo.previewChunkTip')}
                </p>
              </div>
            </div>
          )}
          {currentEstimateMutation.isPending && (
            <div className="space-y-6">
              {Array.from({ length: 10 }, (_, i) => (
                <SkeletonContainer key={i}>
                  <SkeletonRow>
                    <SkeletonRectangle className="w-20" />
                    <SkeletonPoint />
                    <SkeletonRectangle className="w-24" />
                  </SkeletonRow>
                  <SkeletonRectangle className="w-full" />
                  <SkeletonRectangle className="w-full" />
                  <SkeletonRectangle className="w-[422px]" />
                </SkeletonContainer>
              ))}
            </div>
          )}
        </PreviewContainer>
      </FloatRightContainer>
      <PreviewPanel
        isMobile={isMobile}
        dataSourceType={dataSourceType}
        currentDocForm={currentDocForm}
        estimate={estimateHook.estimate}
        parentChildConfig={segmentation.parentChildConfig}
        isSetting={isSetting}
        pickerFiles={preview.getPreviewPickerItems() as Array<{ id: string, name: string, extension: string }>}
        pickerValue={preview.getPreviewPickerValue()}
        isIdle={estimateHook.isIdle}
        isPending={estimateHook.isPending}
        onPickerChange={handlePickerChange}
      />
    </div>
  )
}

export default StepTwo
