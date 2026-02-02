'use client'
import type { FC } from 'react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import Loading from '@/app/components/base/loading'
import Switch from '@/app/components/base/switch'
import Toast from '@/app/components/base/toast'
import IndexFailed from '@/app/components/datasets/common/document-status-with-action/index-failed'
import { useDatasetDetailContextWithSelector } from '@/context/dataset-detail'
import { useProviderContext } from '@/context/provider-context'
import { DataSourceType } from '@/models/datasets'
import { useDocumentList, useInvalidDocumentDetail, useInvalidDocumentList, useToggleAutoUpgradeBatch } from '@/service/knowledge/use-document'
import { useChildSegmentListKey, useSegmentListKey } from '@/service/knowledge/use-segment'
import { useInvalid } from '@/service/use-base'
import { asyncRunSafe } from '@/utils'
import { cn } from '@/utils/classnames'
import Chip from '../../base/chip'
import Sort from '../../base/sort'
import AutoDisabledDocument from '../common/document-status-with-action/auto-disabled-document'
import StatusWithAction from '../common/document-status-with-action/status-with-action'
import useEditDocumentMetadata from '../metadata/hooks/use-edit-dataset-metadata'
import DocumentsHeader from './components/documents-header'
import EmptyElement from './components/empty-element'
import List from './components/list'
import useDocumentsPageState from './hooks/use-documents-page-state'


type IDocumentsProps = {
  datasetId: string
}

const Documents: FC<IDocumentsProps> = ({ datasetId }) => {
  const router = useRouter()
  const { plan } = useProviderContext()
  const isFreePlan = plan.type === 'sandbox'

  const dataset = useDatasetDetailContextWithSelector(s => s.dataset)
  const mutateDatasetRes = useDatasetDetailContextWithSelector(s => s.mutateDatasetRes)
  const toggleAutoUpgradeBatch = useToggleAutoUpgradeBatch()
  const [timerCanRun, setTimerCanRun] = useState(true)
  const isDataSourceNotion = dataset?.data_source_type === DataSourceType.NOTION
  const isDataSourceWeb = dataset?.data_source_type === DataSourceType.WEB
  const isDataSourceFile = dataset?.data_source_type === DataSourceType.FILE
  const embeddingAvailable = !!dataset?.embedding_available
  const debouncedSearchValue = useDebounce(searchValue, { wait: 500 })
  const [globalUpdateEnable, setGlobalUpdateEnable] = useState<boolean | undefined>(undefined)
  const embeddingAvailable = !!dataset?.embedding_available

  // Use custom hook for page state management
  const {
    inputValue,
    debouncedSearchValue,
    handleInputChange,
    statusFilterValue,
    sortValue,
    normalizedStatusFilterValue,
    handleStatusFilterChange,
    handleStatusFilterClear,
    handleSortChange,
    currPage,
    limit,
    handlePageChange,
    handleLimitChange,
    selectedIds,
    setSelectedIds,
    timerCanRun,
    updatePollingState,
    adjustPageForTotal,
  } = useDocumentsPageState()

  // Fetch document list
  const { data: documentsRes, isLoading: isListLoading } = useDocumentList({
    datasetId,
    query: {
      page: currPage + 1,
      limit,
      keyword: debouncedSearchValue,
      status: normalizedStatusFilterValue,
      sort: sortValue,
    },
    refetchInterval: timerCanRun ? 2500 : 0,
  })

  // Update polling state when documents change
  useEffect(() => {
    updatePollingState(documentsRes)
  }, [documentsRes, updatePollingState])

  // Adjust page when total changes
  useEffect(() => {
    adjustPageForTotal(documentsRes)
  }, [documentsRes, adjustPageForTotal])

  // Invalidation hooks
  const invalidDocumentList = useInvalidDocumentList(datasetId)
  const invalidDocumentDetail = useInvalidDocumentDetail()
  const invalidChunkList = useInvalid(useSegmentListKey)
  const invalidChildChunkList = useInvalid(useChildSegmentListKey)

  const handleUpdate = useCallback(() => {
    invalidDocumentList()
    invalidDocumentDetail()
    setTimeout(() => {
      invalidChunkList()
      invalidChildChunkList()
    }, 5000)
  }, [invalidDocumentList, invalidDocumentDetail, invalidChunkList, invalidChildChunkList])

  // Metadata editing hook
  const {
    isShowEditModal: isShowEditMetadataModal,
    showEditModal: showEditMetadataModal,
    hideEditModal: hideEditMetadataModal,
    datasetMetaData,
    handleAddMetaData,
    handleRename,
    handleDeleteMetaData,
    builtInEnabled,
    setBuiltInEnabled,
    builtInMetaData,
  } = useEditDocumentMetadata({
    datasetId,
    dataset,
    onUpdateDocList: invalidDocumentList,
  })

  // Route to document creation page
  const routeToDocCreate = useCallback(() => {
    if (dataset?.runtime_mode === 'rag_pipeline') {
      router.push(`/datasets/${datasetId}/documents/create-from-pipeline`)
      return
    }
    router.push(`/datasets/${datasetId}/documents/create`)
  }, [dataset?.runtime_mode, datasetId, router])

  const total = documentsRes?.total || 0
  const documentsList = documentsRes?.data

  // Render content based on loading and data state
  const renderContent = () => {
    if (isListLoading)
      return <Loading type="app" />

    if (total > 0) {
      return (
        <List
          embeddingAvailable={embeddingAvailable}
          documents={documentsList || []}
          datasetId={datasetId}
          onUpdate={handleUpdate}
          selectedIds={selectedIds}
          onSelectedIdChange={setSelectedIds}
          statusFilterValue={normalizedStatusFilterValue}
          remoteSortValue={sortValue}
          pagination={{
            total,
            limit,
            onLimitChange: handleLimitChange,
            current: currPage,
            onChange: handlePageChange,
          }}
          onManageMetadata={showEditMetadataModal}
        />
      )
    }

    const isDataSourceNotion = dataset?.data_source_type === DataSourceType.NOTION
    return (
      <EmptyElement
        canAdd={embeddingAvailable}
        onClick={routeToDocCreate}
        type={isDataSourceNotion ? 'sync' : 'upload'}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <DocumentsHeader
        datasetId={datasetId}
        dataSourceType={dataset?.data_source_type}
        embeddingAvailable={embeddingAvailable}
        isFreePlan={isFreePlan}
        statusFilterValue={statusFilterValue}
        sortValue={sortValue}
        inputValue={inputValue}
        onStatusFilterChange={handleStatusFilterChange}
        onStatusFilterClear={handleStatusFilterClear}
        onSortChange={handleSortChange}
        onInputChange={handleInputChange}
        isShowEditMetadataModal={isShowEditMetadataModal}
        showEditMetadataModal={showEditMetadataModal}
        hideEditMetadataModal={hideEditMetadataModal}
        datasetMetaData={datasetMetaData}
        builtInMetaData={builtInMetaData}
        builtInEnabled={!!builtInEnabled}
        onAddMetaData={handleAddMetaData}
        onRenameMetaData={handleRename}
        onDeleteMetaData={handleDeleteMetaData}
        onBuiltInEnabledChange={setBuiltInEnabled}
        onAddDocument={routeToDocCreate}
      />
      <div className="flex h-0 grow flex-col px-6 pt-4">
        <div className="flex flex-wrap items-center justify-between">
          <div className="flex items-center gap-2">
            <Chip
              className="w-[160px]"
              showLeftIcon={false}
              value={statusFilterValue}
              items={statusFilterItems}
              onSelect={(item) => {
                const selectedValue = sanitizeStatusValue(item?.value ? String(item.value) : '')
                setStatusFilterValue(selectedValue)
                setCurrPage(0)
                updateQuery({ status: selectedValue, page: 1 })
              }}
              onClear={() => {
                if (statusFilterValue === 'all')
                  return
                setStatusFilterValue('all')
                setCurrPage(0)
                updateQuery({ status: 'all', page: 1 })
              }}
            />
            <Input
              showLeftIcon
              showClearIcon
              wrapperClassName="!w-[200px]"
              value={inputValue}
              onChange={e => handleInputChange(e.target.value)}
              onClear={() => handleInputChange('')}
            />
            <div className="h-3.5 w-px bg-divider-regular"></div>
            <Sort
              order={sortValue.startsWith('-') ? '-' : ''}
              value={sortValue.replace('-', '')}
              items={sortItems}
              onSelect={(value) => {
                const next = String(value) as SortType
                if (next === sortValue)
                  return
                setSortValue(next)
                setCurrPage(0)
                updateQuery({ sort: next, page: 1 })
              }}
            />
          </div>
          <div className="flex !h-8 items-center justify-center gap-2">
            {!isFreePlan && <AutoDisabledDocument datasetId={datasetId} />}
            <IndexFailed datasetId={datasetId} />
            <div className="flex items-center mr-4">
              <span className="text-sm mr-2">{t('dataset.patchAutoUpdate')}</span>
              <Switch
                value={globalUpdateEnable !== undefined ? globalUpdateEnable : dataset?.auto_upgrade}
                onChange={async (checked) => {
                  setGlobalUpdateEnable(checked)
                  if (!documentsRes?.data || documentsRes.data.length === 0)
                    return
                  const updatedDocIds = documentsRes.data.map(doc => doc.id)
                  const [error] = await asyncRunSafe(
                    toggleAutoUpgradeBatch(datasetId, updatedDocIds, checked) 
                  )
                  if (error) {
                    setGlobalUpdateEnable(!checked)
                    Toast.notify({
                      type: 'error',
                      message: t('common.actionMsg.modifiedUnsuccessfully'),
                    })
                  }
                  else {
                    Toast.notify({
                      type: 'success',
                      message: t('common.actionMsg.modifiedSuccessfully'),
                    })
                    mutateDatasetRes?.()
                    setGlobalUpdateEnable(undefined)
                  }
                }}
                size="md"
              />
            </div>
            {!embeddingAvailable && <StatusWithAction type='warning' description={t('dataset.embeddingModelNotAvailable')} />}
            {embeddingAvailable && (
              <Button variant="secondary" className="shrink-0" onClick={showEditMetadataModal}>
                <RiDraftLine className="mr-1 size-4" />
                {t('dataset.metadata.metadata')}
              </Button>
            )}
            {isShowEditMetadataModal && (
              <DatasetMetadataDrawer
                userMetadata={datasetMetaData || []}
                onClose={hideEditMetadataModal}
                onAdd={handleAddMetaData}
                onRename={handleRename}
                onRemove={handleDeleteMetaData}
                builtInMetadata={builtInMetaData || []}
                isBuiltInEnabled={!!builtInEnabled}
                onIsBuiltInEnabledChange={setBuiltInEnabled}
              />
            )}
            {embeddingAvailable && (
              <Button variant="primary" onClick={routeToDocCreate} className="shrink-0">
                <PlusIcon className={cn('mr-2 h-4 w-4 stroke-current')} />
                {isDataSourceNotion && t('datasetDocuments.list.addPages')}
                {isDataSourceWeb && t('datasetDocuments.list.addUrl')}
                {(!dataset?.data_source_type || isDataSourceFile) && t('datasetDocuments.list.addFile')}
              </Button>
            )}
          </div>
        </div>
        {isListLoading
          ? <Loading type="app" />
          // eslint-disable-next-line sonarjs/no-nested-conditional
          : total > 0
            ? (
                <List
                  embeddingAvailable={embeddingAvailable}
                  documents={documentsList || []}
                  datasetId={datasetId}
                  onUpdate={handleUpdate}
                  selectedIds={selectedIds}
                  onSelectedIdChange={setSelectedIds}
                  statusFilterValue={normalizedStatusFilterValue}
                  remoteSortValue={sortValue}
                  pagination={{
                    total,
                    limit,
                    onLimitChange: handleLimitChange,
                    current: currPage,
                    onChange: handlePageChange,
                  }}
                  onManageMetadata={showEditMetadataModal}
                  globalUpdateEnable={globalUpdateEnable}
                  setGlobalUpdateEnable={setGlobalUpdateEnable}
                />
              )
            : (
                <EmptyElement
                  canAdd={embeddingAvailable}
                  onClick={routeToDocCreate}
                  type={isDataSourceNotion ? 'sync' : 'upload'}
                />
              )}
        {renderContent()}
      </div>
    </div>
  )
}

export default Documents
