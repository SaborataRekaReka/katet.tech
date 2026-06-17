<template>
  <private-view :title="currentTitle">
    <template #headline>SEO-конвейер</template>

    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="travel_explore" />
      </v-button>
    </template>

    <template #navigation>
      <v-list nav>
        <template v-for="group in navGroups" :key="group.key">
          <v-divider v-if="group.label">{{ group.label }}</v-divider>
          <v-list-item
            v-for="item in group.items"
            :key="item.id"
            clickable
            :active="activeTab === item.id"
            @click="selectTab(item.id)"
          >
            <v-list-item-icon>
              <v-icon :name="item.icon" />
            </v-list-item-icon>
            <v-list-item-content>{{ item.label }}</v-list-item-content>
            <span v-if="navBadge(item.id)" class="nav-badge">{{ navBadge(item.id) }}</span>
          </v-list-item>
        </template>
      </v-list>
    </template>

    <template #actions>
      <v-button
        small
        :loading="busy.pipeline"
        :disabled="busy.pipeline"
        @click="startFullPipeline"
      >
        <v-icon name="play_arrow" small left />
        Запустить конвейер
      </v-button>
    </template>

    <div class="content">
      <p class="section-intro">{{ currentIntro }}</p>

      <v-notice v-if="!seoToken.trim()" type="warning" class="block">
        Укажите SEO token, чтобы запускать конвейер и публиковать статьи. Открыть настройки доступа во вкладке «Обзор».
      </v-notice>
      <v-notice v-if="error" type="danger" class="block">{{ error }}</v-notice>
      <v-notice v-if="info" type="success" class="block">{{ info }}</v-notice>

      <!-- OVERVIEW -->
      <section v-if="activeTab === 'overview'" class="panel">
        <div class="stats-grid">
          <button type="button" class="stat-card" @click="selectTab('queries')">
            <span class="stat-value">{{ summary.rawTotal }}</span>
            <span class="stat-label">Сырые запросы</span>
          </button>
          <button type="button" class="stat-card" @click="selectTab('clusters')">
            <span class="stat-value">{{ summary.clustersTotal }}</span>
            <span class="stat-label">Кластеры</span>
          </button>
          <button type="button" class="stat-card" @click="selectTab('generate')">
            <span class="stat-value">{{ summary.articlesDraft }}</span>
            <span class="stat-label">Сгенерированные статьи</span>
          </button>
          <button type="button" class="stat-card" @click="selectTab('blog')">
            <span class="stat-value">{{ summary.postsPublished }}</span>
            <span class="stat-label">Опубликовано в блоге</span>
          </button>
          <button type="button" class="stat-card" @click="selectTab('jobs')">
            <span class="stat-value">{{ summary.jobsRunning }}</span>
            <span class="stat-label">Активные задачи</span>
          </button>
        </div>

        <div class="card-grid">
          <div class="card">
            <div class="card-head">
              <v-icon name="rocket_launch" small />
              <h3>Полный конвейер</h3>
            </div>
            <p class="muted">Seed → очистка → кластеризация → план → автогенерация черновиков.</p>
            <div class="form-row">
              <label class="field">
                <span class="field-label">Авто-черновики (топ-N)</span>
                <input v-model.number="autoDraftTop" type="number" min="0" max="20" class="control control-sm" />
              </label>
              <v-button small :loading="busy.pipeline" @click="startFullPipeline">Старт</v-button>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <v-icon name="auto_awesome" small />
              <h3>Пакетная генерация</h3>
            </div>
            <p class="muted">Берёт лучшие незакрытые темы или выбранные кластеры во вкладке «Генерация».</p>
            <div class="form-row form-row--between">
              <span class="muted small">По умолчанию создаётся 1 статья за запуск.</span>
              <v-button small :loading="busy.batch" @click="startBatchFromOverview">Генерировать</v-button>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <v-icon name="hub" small />
              <h3>ИИ-кластеризация</h3>
            </div>
            <p class="muted">Пересобирает кластеры и контент-план из импортированной семантики.</p>
            <div class="form-row">
              <v-button small secondary :loading="busy.clusterize" @click="startClusterize">Запустить</v-button>
              <span v-if="clusterizeJob.running" class="muted small">Job #{{ clusterizeJob.jobId }} · {{ clusterizeJob.progress }}%</span>
            </div>
            <v-progress-linear v-if="clusterizeJob.running" :value="clusterizeJob.progress" rounded class="progress" />
          </div>
        </div>

        <div class="card">
          <div class="card-head card-head--between">
            <div class="card-head">
              <v-icon name="key" small />
              <h3>Доступ к SEO API</h3>
            </div>
            <v-chip small :class="seoToken.trim() ? 'chip-green' : 'chip-amber'">
              {{ seoToken.trim() ? 'токен задан' : 'нет токена' }}
            </v-chip>
          </div>
          <p class="muted">Токен хранится только в этом браузере и передаётся в защищённые операции конвейера.</p>
          <div class="form-row">
            <input
              v-model="seoToken"
              type="password"
              autocomplete="off"
              placeholder="Вставьте SEO_ADMIN_TOKEN"
              class="control control-grow"
            />
            <v-button small secondary @click="saveToken">Сохранить токен</v-button>
          </div>
        </div>

        <div class="card">
          <div class="card-head card-head--between">
            <div class="card-head">
              <v-icon name="manage_history" small />
              <h3>Последние задачи</h3>
            </div>
            <v-button x-small secondary icon @click="loadJobs"><v-icon name="refresh" small /></v-button>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Тип</th>
                  <th>Статус</th>
                  <th>Прогресс</th>
                  <th>Шаг</th>
                  <th>Старт</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="job in jobs.slice(0, 8)" :key="job.id">
                  <td>#{{ job.id }}</td>
                  <td>{{ job.kind }}</td>
                  <td><span class="badge" :class="jobBadgeClass(job.status)">{{ job.status }}</span></td>
                  <td>{{ job.progress }}/{{ job.total }}</td>
                  <td>{{ job.step || '-' }}</td>
                  <td>{{ formatDate(job.started_at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="jobs.length === 0" class="empty-state">
            <v-icon name="manage_history" small />
            <p class="empty-title">Задач пока нет</p>
            <p class="empty-text">Запустите конвейер или отдельную операцию, чтобы увидеть прогресс здесь.</p>
          </div>
        </div>
      </section>

      <!-- QUERIES -->
      <section v-else-if="activeTab === 'queries'" class="panel">
        <div class="card">
          <div class="card-head"><v-icon name="upload_file" small /><h3>Импорт запросов</h3></div>
          <p class="muted">Формат: «фраза;частотность» или одна фраза в строке. Запросы с минус-словами автоматически исключаются сразу при импорте (без ИИ).</p>
          <div class="toolbar">
            <input v-model="importState.seedTerm" type="text" placeholder="Seed term" class="control" />
            <input v-model="importState.region" type="text" placeholder="Регион" class="control" />
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" class="control control-grow" @change="handleImportFileChange" />
            <v-button small :loading="busy.import" :disabled="!importState.content.trim()" @click="runImport">Импортировать</v-button>
          </div>
          <textarea v-model="importState.content" rows="5" placeholder="Пример: аренда экскаватора;1200" class="control control-area" />
          <p v-if="importState.fileName" class="muted small">Файл загружен: {{ importState.fileName }}</p>
          <p v-if="importState.result" class="muted small">
            Разобрано: {{ importState.result.parsed ?? importState.result.imported }}, импортировано: {{ importState.result.imported }}
            <span v-if="importState.result.filteredByMinusWords > 0">, исключено по минус-словам: {{ importState.result.filteredByMinusWords }}</span>
            <span v-if="importState.result.cleaned !== null && importState.result.cleaned !== undefined">, обработано: {{ importState.result.cleaned }}</span>
          </p>
          <v-notice v-if="importState.error" type="danger" class="block">{{ importState.error }}</v-notice>
        </div>

        <div class="card">
          <div class="toolbar">
            <input v-model="queryFilters.q" type="text" placeholder="Поиск по тексту запроса" class="control control-grow" />
            <select v-model.number="queryFilters.pageSize" class="control">
              <option :value="50">50 на странице</option>
              <option :value="100">100 на странице</option>
              <option :value="150">150 на странице</option>
              <option :value="200">200 на странице</option>
              <option :value="300">300 на странице</option>
            </select>
            <v-button small @click="applyQueriesFilters">Применить</v-button>
            <v-button small secondary @click="resetQueriesFilters">Сбросить</v-button>
            <span class="muted small">Всего: {{ numberFormat(queriesPage.total) }}</span>
            <span class="spacer" />
            <v-button small :loading="busy.clusterize" @click="startClusterize"><v-icon name="hub" small left />Обновить кластеры</v-button>
          </div>

          <v-progress-linear v-if="clusterizeJob.running" :value="clusterizeJob.progress" rounded class="progress" />

          <div v-if="selectedQueryIds.length > 0" class="selection-bar">
            <span class="strong">Выбрано: {{ selectedQueryIds.length }}</span>
            <select v-model="queryTargetClusterId" class="control">
              <option value="">Выберите кластер</option>
              <option v-for="cluster in clusterTargets" :key="cluster.id" :value="String(cluster.id)">
                {{ (cluster.cluster_name || cluster.primary_keyword || `Кластер #${cluster.id}`).slice(0, 90) }}
              </option>
            </select>
            <v-button small :disabled="busy.queryAction" @click="mergeQueriesToExisting">В выбранный кластер</v-button>
            <input v-model="newQueryClusterName" type="text" placeholder="Название нового кластера" class="control" />
            <v-button small secondary :disabled="busy.queryAction" @click="mergeQueriesToNew">В новый кластер</v-button>
            <v-button small kind="danger" :disabled="busy.queryAction" @click="deleteSelectedQueries">Удалить</v-button>
          </div>

          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th class="check-col">
                    <input type="checkbox" :checked="allQueriesSelected" @change="toggleAllQueries($event.target.checked)" />
                  </th>
                  <th>Запрос</th>
                  <th>Частотность</th>
                  <th>Интент</th>
                  <th>Релевантность</th>
                  <th>Кластер</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in queriesPage.items" :key="row.id" :class="{ 'row-selected': selectedQuerySet.has(row.id) }">
                  <td class="check-col">
                    <input type="checkbox" :checked="selectedQuerySet.has(row.id)" @change="toggleQuerySelection(row.id, $event.target.checked)" />
                  </td>
                  <td>
                    <div class="cell-main">{{ row.keyword }}</div>
                    <div class="cell-sub">ID {{ row.id }}</div>
                  </td>
                  <td class="num">{{ numberFormat(row.frequency) }}</td>
                  <td>{{ intentLabel(row.intent) }}</td>
                  <td>
                    <span class="badge" :class="row.is_relevant === false ? 'badge--red' : 'badge--green'">
                      {{ row.is_relevant === false ? 'irrelevant' : 'relevant' }}
                    </span>
                  </td>
                  <td>{{ row.cluster_name || '-' }}</td>
                  <td><span class="badge" :class="contentStatusMeta(row.content_status).badge">{{ contentStatusMeta(row.content_status).label }}</span></td>
                  <td>
                    <v-button x-small kind="danger" secondary :disabled="busy.queryAction" @click="deleteOneQuery(row.id)">Удалить</v-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="queriesPage.items.length === 0" class="empty-state">
            <v-icon name="search_off" small />
            <p class="empty-title">Запросов по текущему фильтру нет</p>
            <p class="empty-text">Импортируйте запросы в верхнем блоке или измените условия фильтра.</p>
          </div>

          <div v-if="queriesPage.items.length > 0" class="pagination">
            <v-button x-small secondary :disabled="queriesPage.page <= 1" @click="goToQueriesPage(queriesPage.page - 1)">Назад</v-button>
            <span class="muted small">Страница {{ queriesPage.page }} из {{ queriesPage.totalPages }}</span>
            <v-button x-small secondary :disabled="queriesPage.page >= queriesPage.totalPages" @click="goToQueriesPage(queriesPage.page + 1)">Вперёд</v-button>
          </div>
        </div>
      </section>

      <!-- SEMANTICS -->
      <section v-else-if="activeTab === 'semantics'" class="panel">
        <div class="card">
          <div class="card-head card-head--between">
            <div class="card-head"><v-icon name="insights" small /><h3>Сводка семантики</h3></div>
            <div class="row">
              <v-button x-small secondary @click="reloadSemanticsAll"><v-icon name="refresh" small left />Обновить</v-button>
              <v-button x-small kind="danger" secondary :disabled="busy.semanticsWorkflow || semanticsStats.rawMock <= 0" @click="purgeMockData">
                Удалить mock
              </v-button>
            </div>
          </div>
          <div class="badge-row">
            <span class="badge badge--blue">mode: {{ semanticsStats.mode }}</span>
            <span class="badge badge--gray">raw: {{ semanticsStats.rawTotal }}</span>
            <span class="badge badge--blue">wordstat: {{ semanticsStats.rawWordstatApi }}</span>
            <span class="badge badge--green">csv: {{ semanticsStats.rawCsv }}</span>
            <span class="badge badge--red">mock: {{ semanticsStats.rawMock }}</span>
            <span class="badge badge--gray">normalized: {{ semanticsStats.normalizedTotal }}</span>
            <span class="badge badge--green">relevant: {{ semanticsStats.normalizedRelevant }}</span>
            <span class="badge badge--red">irrelevant: {{ semanticsStats.normalizedIrrelevant }}</span>
            <span class="badge badge--gray">clusters: {{ semanticsStats.clustersTotal }}</span>
            <span class="badge badge--blue">plan: {{ semanticsStats.planItems }}</span>
            <span class="badge badge--green">closed: {{ semanticsStats.contentClosed }}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><v-icon name="upload_file" small /><h3>Импорт Wordstat CSV/TSV</h3></div>
          <p class="muted">Поддерживается файл Wordstat, «фраза;частотность» и одна фраза в строке без частотности.</p>
          <div class="toolbar">
            <input v-model="importState.seedTerm" type="text" placeholder="Seed term" class="control" />
            <input v-model="importState.region" type="text" placeholder="Регион" class="control" />
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" class="control control-grow" @change="handleImportFileChange" />
            <v-button small :loading="busy.import" :disabled="!importState.content.trim()" @click="runImport">Импортировать</v-button>
          </div>
          <textarea v-model="importState.content" rows="5" placeholder="Пример: аренда экскаватора;1200" class="control control-area" />
          <p v-if="importState.fileName" class="muted small">Файл загружен: {{ importState.fileName }}</p>
          <p v-if="importState.result" class="muted small">
            Разобрано: {{ importState.result.parsed ?? importState.result.imported }}, импортировано: {{ importState.result.imported }}
            <span v-if="importState.result.mode">, режим: {{ importState.result.mode }}</span>
          </p>
          <v-notice v-if="importState.error" type="danger" class="block">{{ importState.error }}</v-notice>
        </div>

        <div class="card">
          <div class="card-head"><v-icon name="cleaning_services" small /><h3>Очистка семантики</h3></div>
          <div class="form-grid">
            <label class="field">
              <span class="field-label">Минимальная частотность</span>
              <input v-model.number="cleaning.min_frequency" type="number" min="1" max="100000" class="control" />
            </label>
            <label class="checkbox-row">
              <input v-model="cleaning.require_business_fit" type="checkbox" />
              <span>Требовать соответствие бизнес-контексту</span>
            </label>
            <label class="field field-wide">
              <span class="field-label">Дополнительные стоп-слова (по одному в строке)</span>
              <textarea v-model="cleaning.junk_words_text" rows="4" placeholder="бесплатно&#10;скачать" class="control control-area" />
            </label>
          </div>
          <div class="row">
            <v-button small secondary :loading="busy.semanticsCleaning && cleanJob.running === false" @click="saveCleaningSettings">Сохранить правила</v-button>
            <v-button small :loading="busy.semanticsCleaning" @click="runCleaningPipeline">Очистить</v-button>
          </div>
          <v-progress-linear v-if="cleanJob.running" :value="cleanJob.progress" rounded class="progress" />
          <p v-if="cleanJob.running" class="muted small">{{ cleanJob.message || 'Очистка…' }}</p>
        </div>

        <div class="card">
          <div class="card-head"><v-icon name="key" small /><h3>OpenAI API key</h3></div>
          <p class="muted">Вставьте API key прямо здесь. Ключ хранится на backend и не показывается целиком.</p>
          <div class="toolbar">
            <input
              v-model="openAiKey.input"
              :type="openAiKey.reveal ? 'text' : 'password'"
              autocomplete="off"
              placeholder="sk-..."
              class="control control-grow"
            />
            <v-button x-small secondary :disabled="busy.openAiKey" @click="openAiKey.reveal = !openAiKey.reveal">
              {{ openAiKey.reveal ? 'Скрыть' : 'Показать' }}
            </v-button>
            <v-button small secondary :loading="busy.openAiKey" @click="loadOpenAiKey">Обновить</v-button>
            <v-button small :loading="busy.openAiKey" :disabled="!openAiKey.input.trim()" @click="saveOpenAiKey">Сохранить ключ</v-button>
            <v-button small kind="danger" secondary :loading="busy.openAiKey" :disabled="!openAiKey.hasKey" @click="clearOpenAiKey">Удалить ключ</v-button>
          </div>
          <p class="muted small">
            Статус:
            <span v-if="openAiKey.hasKey">ключ задан ({{ openAiKey.masked || 'скрыт' }}; {{ openAiKeySourceLabel(openAiKey.source) }})</span>
            <span v-else>ключ не задан</span>
          </p>
        </div>

        <div class="card">
          <div class="card-head"><v-icon name="tune" small /><h3>Настройки LLM-моделей</h3></div>
          <p class="muted">Выбор моделей для генерации брифов, статей, кластеризации и эмбеддингов.</p>
          <p class="muted small">
            Каталог:
            <span v-if="llmCatalog.source === 'db' || llmCatalog.source === 'env'">из OpenAI API ({{ openAiKeySourceLabel(llmCatalog.source) }})</span>
            <span v-else>fallback-список</span>
            · text {{ llmCatalog.textTotal }}, embedding {{ llmCatalog.embeddingTotal }}, image {{ llmCatalog.imageTotal }}
          </p>
          <p v-if="llmCatalog.lastError" class="muted small">Причина fallback: {{ llmCatalog.lastError }}</p>
          <div class="form-grid">
            <label class="field">
              <span class="field-label">Strong (статьи, брифы)</span>
              <select v-model="llmModels.strong" class="control">
                <option v-for="item in llmModelOptions" :key="`strong-${item}`" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">Cheap (вспомогательные задачи)</span>
              <select v-model="llmModels.cheap" class="control">
                <option v-for="item in llmModelOptions" :key="`cheap-${item}`" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">Cluster</span>
              <select v-model="llmModels.cluster" class="control">
                <option v-for="item in llmModelOptions" :key="`cluster-${item}`" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">Embedding</span>
              <select v-model="llmModels.embedding" class="control">
                <option v-for="item in llmEmbeddingOptions" :key="`embedding-${item}`" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">Image</span>
              <select v-model="llmModels.image" class="control">
                <option v-for="item in llmImageOptions" :key="`image-${item}`" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>
          <div class="row">
            <v-button small secondary :loading="busy.llmModels || busy.llmCatalog" @click="reloadLlmSettings">Обновить</v-button>
            <v-button small :loading="busy.llmModels" @click="saveLlmModels">Сохранить модели</v-button>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><v-icon name="account_tree" small /><h3>Рабочий процесс CSV</h3></div>
          <div class="row">
            <v-button small :loading="busy.semanticsWorkflow" @click="startSemanticsRebuild">Обработать семантику</v-button>
            <span class="muted small">Очистка, кластеризация и обновление контент-плана.</span>
          </div>
          <div class="row">
            <v-button small secondary :loading="busy.batch" @click="startWorkflowBatchGeneration">Сгенерировать статью</v-button>
            <span class="muted small">Создаётся 1 статья за запуск.</span>
          </div>
          <v-progress-linear v-if="rebuildJob.running" :value="rebuildJob.progress" rounded class="progress" />
          <p v-if="rebuildJob.running" class="muted small">{{ rebuildJob.message || 'Обработка…' }}</p>
        </div>

        <div class="card">
          <div class="card-head card-head--between">
            <div class="card-head"><v-icon name="filter_alt" small /><h3>Фильтры таблиц</h3></div>
            <v-button x-small secondary @click="applySemanticsFilters">Применить</v-button>
          </div>
          <div class="toolbar">
            <input v-model="semanticsFilters.q" type="text" placeholder="Поиск по фразе / seed" class="control control-grow" />
            <select v-model="semanticsFilters.source" class="control">
              <option value="all">Источник: все</option>
              <option value="wordstat_api">Wordstat API</option>
              <option value="csv">CSV</option>
              <option value="mock">mock</option>
            </select>
            <select v-model="semanticsFilters.relevance" class="control">
              <option value="all">Релевантность: все</option>
              <option value="relevant">Релевантные</option>
              <option value="irrelevant">Нерелевантные</option>
            </select>
            <input v-model.number="semanticsFilters.limit" type="number" min="20" max="1000" step="20" class="control control-sm" />
          </div>
        </div>

        <div class="card">
          <div class="card-head"><v-icon name="table_rows" small /><h3>Сырые запросы (raw_keywords)</h3></div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>ID</th><th>Источник</th><th>Seed</th><th>Фраза</th><th>Частотность</th><th>Регион</th></tr>
              </thead>
              <tbody>
                <tr v-for="row in semanticsRaw" :key="row.id">
                  <td>{{ row.id }}</td>
                  <td><span class="badge" :class="sourceBadgeClass(row.source)">{{ row.source }}</span></td>
                  <td>{{ row.seed_term || '-' }}</td>
                  <td class="cell-main">{{ row.keyword }}</td>
                  <td>{{ row.frequency ?? '-' }}</td>
                  <td>{{ row.region || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="semanticsRaw.length === 0" class="empty-state empty-state--compact">
            <v-icon name="table_rows" small />
            <p class="empty-title">Нет данных по текущему фильтру</p>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><v-icon name="spellcheck" small /><h3>Нормализованные (normalized_keywords)</h3></div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>ID</th><th>Источник</th><th>Фраза</th><th>normalized</th><th>Интент</th><th>Релевантность</th><th>Причина</th><th>Частотность</th></tr>
              </thead>
              <tbody>
                <tr v-for="row in semanticsNormalized" :key="row.id">
                  <td>{{ row.id }}</td>
                  <td><span class="badge" :class="sourceBadgeClass(row.raw_source)">{{ row.raw_source || '-' }}</span></td>
                  <td class="cell-main">{{ row.keyword }}</td>
                  <td>{{ row.normalized_keyword }}</td>
                  <td>{{ row.detected_intent || '-' }}</td>
                  <td><span class="badge" :class="relevanceBadgeClass(row.is_relevant)">{{ relevanceLabel(row.is_relevant) }}</span></td>
                  <td>{{ row.irrelevance_reason || '-' }}</td>
                  <td>{{ row.frequency }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="semanticsNormalized.length === 0" class="empty-state empty-state--compact">
            <v-icon name="spellcheck" small />
            <p class="empty-title">Нет данных по текущему фильтру</p>
          </div>
        </div>
      </section>

      <!-- CLUSTERS -->
      <section v-else-if="activeTab === 'clusters'" class="panel">
        <div class="card">
          <div class="card-head card-head--between">
            <div class="card-head"><v-icon name="dataset" small /><h3>Индекс SEO-материалов сайта</h3></div>
            <v-button x-small secondary @click="loadSiteIndex"><v-icon name="refresh" small left />Обновить</v-button>
          </div>
          <div class="index-grid">
            <div><span class="muted small">Всего</span><strong>{{ siteIndex.total }}</strong></div>
            <div><span class="muted small">Страницы</span><strong>{{ siteIndex.pages }}</strong></div>
            <div><span class="muted small">Статьи</span><strong>{{ siteIndex.posts }}</strong></div>
            <div><span class="muted small">Услуги</span><strong>{{ siteIndex.equipmentTypes }}</strong></div>
            <div><span class="muted small">Типы работ</span><strong>{{ siteIndex.workTypes }}</strong></div>
            <div><span class="muted small">Категории</span><strong>{{ siteIndex.brands }}</strong></div>
          </div>
        </div>

        <div class="card">
          <div class="card-head card-head--between">
            <div class="card-head"><v-icon name="bubble_chart" small /><h3>Кластеры</h3></div>
            <div class="row">
              <v-button x-small :loading="busy.clusterize" @click="startClusterize"><v-icon name="hub" small left />Обновить кластеры</v-button>
              <v-button x-small secondary @click="loadSemanticsClusters"><v-icon name="refresh" small left />Обновить список</v-button>
            </div>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Кластер</th><th>Запросов</th><th>Частотность</th><th>Статус</th><th>Покрытие</th><th /></tr>
              </thead>
              <tbody>
                <tr v-for="cluster in semanticsClusters" :key="cluster.id">
                  <td>
                    <div class="cell-main">{{ cluster.cluster_name || cluster.primary_keyword || `Кластер #${cluster.id}` }}</div>
                    <div v-if="cluster.primary_keyword && cluster.cluster_name && cluster.primary_keyword !== cluster.cluster_name" class="cell-sub">
                      {{ cluster.primary_keyword }}
                    </div>
                    <div v-if="Array.isArray(cluster.related_pages) && cluster.related_pages.length > 0" class="related-list">
                      <div v-for="page in cluster.related_pages.slice(0, 3)" :key="`${cluster.id}-${page.url}`" class="related-item">
                        <span class="badge badge--gray">{{ relatedSourceLabel(page.source) }}</span>
                        <a class="link" :href="page.url" target="_blank" rel="noreferrer">{{ page.title || page.url }}</a>
                        <span class="muted small">{{ Math.round((Number(page.score || 0)) * 100) }}%</span>
                      </div>
                    </div>
                    <div class="row tight">
                      <v-button x-small secondary @click="toggleClusterKeywords(cluster.id)">
                        {{ getClusterKeywordsState(cluster.id).expanded ? 'Скрыть запросы' : 'Показать запросы' }}
                      </v-button>
                    </div>
                    <div v-if="getClusterKeywordsState(cluster.id).expanded" class="keywords-box">
                      <p v-if="getClusterKeywordsState(cluster.id).loading" class="muted small">Загрузка…</p>
                      <v-notice v-if="getClusterKeywordsState(cluster.id).error" type="danger" class="block">{{ getClusterKeywordsState(cluster.id).error }}</v-notice>
                      <ul v-if="getClusterKeywordsState(cluster.id).items.length > 0" class="keywords-list">
                        <li v-for="item in getClusterKeywordsState(cluster.id).items" :key="item.keyword_id" class="keywords-item">
                          <div>
                            <div class="cell-main">{{ item.keyword }}</div>
                            <div class="cell-sub">частотность {{ numberFormat(item.frequency) }}<span v-if="item.role !== 'secondary'"> · {{ item.role }}</span></div>
                          </div>
                          <v-button x-small kind="danger" secondary :disabled="getClusterKeywordsState(cluster.id).removingId === item.keyword_id" @click="removeKeywordFromCluster(cluster.id, item.keyword_id)">
                            Убрать
                          </v-button>
                        </li>
                      </ul>
                      <p v-if="!getClusterKeywordsState(cluster.id).loading && getClusterKeywordsState(cluster.id).items.length === 0 && !getClusterKeywordsState(cluster.id).error" class="muted small">
                        В кластере нет запросов.
                      </p>
                    </div>
                  </td>
                  <td class="num">{{ cluster.keyword_count }}</td>
                  <td class="num">{{ numberFormat(cluster.total_frequency) }}</td>
                  <td><span class="badge" :class="clusterStatusMeta(cluster).badge">{{ clusterStatusMeta(cluster).label }}</span></td>
                  <td>
                    <span class="badge" :class="coverageMeta(cluster).badge">{{ coverageMeta(cluster).label }}</span>
                    <div v-if="cluster.target_existing_url" class="cell-sub">
                      <a class="link" :href="cluster.target_existing_url" target="_blank" rel="noreferrer">Основная страница</a>
                    </div>
                  </td>
                  <td>
                    <div class="actions-inline">
                      <v-button v-if="cluster.has_article && cluster.article_id" x-small secondary @click="openEditor(cluster.article_id)">Статья</v-button>
                      <v-button v-else x-small secondary @click="goToGenerateTab">Создать</v-button>
                      <v-button
                        x-small
                        kind="danger"
                        secondary
                        :disabled="busy.clusterAction || cluster.has_article"
                        :title="cluster.has_article ? 'Сначала удалите связанную статью' : ''"
                        @click="deleteCluster(cluster)"
                      >
                        Удалить
                      </v-button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="semanticsClusters.length === 0" class="empty-state">
            <v-icon name="bubble_chart" small />
            <p class="empty-title">Кластеров пока нет</p>
            <p class="empty-text">Импортируйте запросы и запустите ИИ-кластеризацию.</p>
          </div>
        </div>
      </section>

      <!-- PLAN -->
      <section v-else-if="activeTab === 'plan'" class="panel">
        <div class="card">
          <div class="card-head card-head--between">
            <div class="card-head"><v-icon name="fact_check" small /><h3>Очередь контент-плана</h3></div>
            <div class="row">
              <select v-model="planStatus" class="control">
                <option v-for="option in planStatusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <v-button x-small secondary @click="loadPlan"><v-icon name="refresh" small left />Обновить</v-button>
            </div>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Кластер</th><th>Интент</th><th>Действие</th><th>Частотность</th><th>Приоритет</th><th>Статус</th><th>Решение</th></tr>
              </thead>
              <tbody>
                <tr v-for="item in planItems" :key="item.id">
                  <td>
                    <div class="cell-main">{{ item.cluster_name || item.primary_keyword || `#${item.cluster_id}` }}</div>
                    <div v-if="item.reason" class="cell-sub">{{ item.reason }}</div>
                    <div v-if="item.target_existing_url" class="cell-sub">→ {{ item.target_existing_url }}</div>
                  </td>
                  <td>{{ item.main_intent || '-' }}</td>
                  <td>{{ actionLabel(item.recommended_action) }}</td>
                  <td>{{ numberFormat(item.total_frequency || 0) }}</td>
                  <td>{{ item.priority }}</td>
                  <td><span class="badge" :class="planStatusBadge(item.status)">{{ planStatusLabel(item.status) }}</span></td>
                  <td>
                    <div v-if="item.has_article" class="row tight">
                      <span class="badge badge--green">Статья создана</span>
                      <v-button v-if="item.article_id" x-small secondary @click="openEditor(item.article_id)">Открыть</v-button>
                    </div>
                    <div v-else class="actions-inline">
                      <template v-if="item.status === 'pending_review'">
                        <v-button x-small secondary :disabled="busy.planAction" @click="reviewPlan(item.id, 'approve')">Одобрить</v-button>
                        <v-button x-small kind="danger" secondary :disabled="busy.planAction" @click="rejectPlan(item.id)">Отклонить</v-button>
                      </template>
                      <v-button x-small secondary :disabled="busy.planAction" @click="createBrief(item.id)">Brief</v-button>
                      <v-button x-small :disabled="busy.planAction" @click="createArticle(item.id)">Статья</v-button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="planItems.length === 0" class="empty-state empty-state--compact">
            <v-icon name="fact_check" small />
            <p class="empty-title">Элементов плана пока нет</p>
          </div>
        </div>
      </section>

      <!-- GENERATE -->
      <section v-else-if="activeTab === 'generate'" class="panel">
        <div class="card">
          <div class="card-head card-head--between">
            <div class="card-head"><v-icon name="auto_awesome" small /><h3>Генерация статей</h3></div>
            <v-button x-small secondary @click="loadGeneratableClusters"><v-icon name="refresh" small left />Обновить</v-button>
          </div>
          <div class="form-row form-row--between">
            <span class="muted small">
              {{ generateSelectedIds.length > 0 ? `Выбрано кластеров: ${generateSelectedIds.length}` : 'Будет создана 1 статья по лучшей незакрытой теме' }}
            </span>
            <v-button small :loading="busy.batch" @click="startBatchGeneration">Сгенерировать</v-button>
          </div>
          <v-progress-linear v-if="generateState.running || generateState.progress > 0" :value="generateState.progress" rounded class="progress" />
          <div v-if="generateState.logs.length > 0" class="log-box">
            <div v-for="(line, idx) in generateState.logs" :key="`${idx}-${line}`">{{ line }}</div>
          </div>
          <div v-if="generateState.results && generateState.results.length > 0" class="results-list">
            <div v-for="item in generateState.results" :key="item.id" class="result-item">
              <span class="cell-main">{{ item.title }}</span>
              <v-button x-small secondary @click="openEditor(item.id)">Открыть черновик</v-button>
            </div>
          </div>
          <p v-if="generateState.results && generateState.results.length === 0 && !generateState.error" class="muted small">Новых черновиков не создано.</p>
        </div>

        <div class="card">
          <div class="card-head card-head--between">
            <div class="card-head"><v-icon name="checklist" small /><h3>Кластеры для генерации</h3></div>
            <v-button x-small secondary @click="toggleAllGenerateClusters">{{ allGeneratableSelected ? 'Снять выбор' : 'Выбрать все' }}</v-button>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th class="check-col" /><th>Кластер</th><th>Запросов</th><th>Частотность</th><th>Приоритет</th></tr>
              </thead>
              <tbody>
                <tr v-for="cluster in generatableClusters" :key="cluster.id" :class="{ 'row-selected': generateSelectedIds.includes(cluster.id) }">
                  <td class="check-col">
                    <input type="checkbox" :checked="generateSelectedIds.includes(cluster.id)" @change="toggleGenerateCluster(cluster.id)" />
                  </td>
                  <td>
                    <div class="cell-main">{{ cluster.cluster_name || cluster.primary_keyword || `Кластер #${cluster.id}` }}</div>
                    <div v-if="cluster.primary_keyword && cluster.cluster_name && cluster.primary_keyword !== cluster.cluster_name" class="cell-sub">
                      {{ cluster.primary_keyword }}
                    </div>
                  </td>
                  <td class="num">{{ cluster.keyword_count }}</td>
                  <td class="num">{{ numberFormat(cluster.total_frequency) }}</td>
                  <td>{{ cluster.priority ?? '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="generatableClusters.length === 0" class="empty-state">
            <v-icon name="auto_awesome" small />
            <p class="empty-title">Нет кластеров для генерации</p>
            <p class="empty-text">Все темы закрыты или кластеры ещё не собраны.</p>
          </div>
        </div>

        <div class="card">
          <div class="card-head card-head--between">
            <div class="card-head"><v-icon name="edit_note" small /><h3>Сгенерированные статьи</h3></div>
            <div class="row">
              <select v-model="articleStatus" class="control">
                <option v-for="option in articleStatusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <v-button x-small secondary @click="loadArticles"><v-icon name="refresh" small left />Обновить</v-button>
            </div>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>ID</th><th>Заголовок</th><th>Кластер</th><th>Статус</th><th>Запись в блоге</th><th>Действия</th></tr>
              </thead>
              <tbody>
                <tr v-for="item in articles" :key="item.id">
                  <td>#{{ item.id }}</td>
                  <td>{{ item.title || '(без заголовка)' }}</td>
                  <td>{{ item.cluster_name || '-' }}</td>
                  <td><span class="badge" :class="articleStatusBadge(item.status)">{{ item.status }}</span></td>
                  <td>
                    <a v-if="item.published_post_id" class="link" :href="directusPostUrl(item.published_post_id)">
                      <v-icon name="open_in_new" x-small /> запись #{{ item.published_post_id }}
                    </a>
                    <span v-else class="muted small">не опубликовано</span>
                  </td>
                  <td>
                    <div class="actions-inline">
                      <v-button x-small secondary @click="openEditor(item.id)">Редактировать</v-button>
                      <v-button x-small :disabled="busy.articleAction" @click="publish(item.id)">Опубликовать</v-button>
                      <v-button
                        v-if="item.status === 'draft' && !item.published_post_id"
                        x-small
                        kind="danger"
                        secondary
                        :disabled="busy.articleAction"
                        @click="deleteDraft(item.id)"
                      >
                        Удалить
                      </v-button>
                      <a v-if="item.url_path && item.post_status === 'publish'" class="link small" :href="item.url_path" target="_blank" rel="noreferrer">На сайте</a>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="articles.length === 0" class="empty-state">
            <v-icon name="edit_note" small />
            <p class="empty-title">Сгенерированных статей пока нет</p>
            <p class="empty-text">Создайте черновики во вкладке «Генерация».</p>
          </div>
        </div>

        <div v-if="editor.open" class="card editor-card">
          <div class="card-head card-head--between">
            <div class="card-head"><v-icon name="article" small /><h3>Редактор статьи #{{ editor.id }}</h3></div>
            <div class="row">
              <a v-if="editor.publishedPostId" class="link small" :href="directusPostUrl(editor.publishedPostId)"><v-icon name="open_in_new" x-small /> Открыть запись</a>
              <v-button x-small secondary icon @click="closeEditor"><v-icon name="close" small /></v-button>
            </div>
          </div>
          <div class="form-grid">
            <label class="field"><span class="field-label">Заголовок</span><input v-model="editor.title" type="text" class="control" /></label>
            <label class="field"><span class="field-label">Slug</span><input v-model="editor.slug" type="text" class="control" /></label>
            <label class="field"><span class="field-label">SEO title</span><input v-model="editor.seoTitle" type="text" class="control" /></label>
            <label class="field"><span class="field-label">Meta description</span><textarea v-model="editor.metaDescription" rows="3" class="control control-area" /></label>
            <label class="field"><span class="field-label">Статус</span>
              <select v-model="editor.status" class="control">
                <option value="draft">draft</option>
                <option value="needs_review">needs_review</option>
                <option value="approved">approved</option>
                <option value="published">published</option>
                <option value="rejected">rejected</option>
              </select>
            </label>
            <label class="field field-wide"><span class="field-label">Body HTML</span><textarea v-model="editor.bodyHtml" rows="14" class="control control-area" /></label>
          </div>
          <div class="row">
            <v-button small :loading="editor.saving" @click="saveEditor">Сохранить</v-button>
            <v-button small secondary :loading="editor.publishing" @click="publish(editor.id)">Опубликовать</v-button>
            <v-button
              v-if="editor.status === 'draft' && !editor.publishedPostId"
              small
              kind="danger"
              secondary
              :disabled="busy.articleAction || editor.saving || editor.publishing"
              @click="deleteDraft(editor.id)"
            >
              Удалить черновик
            </v-button>
          </div>
        </div>
      </section>

      <!-- BLOG (Directus posts) -->
      <section v-else-if="activeTab === 'blog'" class="panel">
        <div class="card">
          <div class="card-head card-head--between">
            <div class="card-head"><v-icon name="article" small /><h3>Записи блога сайта</h3></div>
            <v-button small secondary :href="directusPostsUrl"><v-icon name="open_in_new" small left />Открыть коллекцию</v-button>
          </div>

          <div class="badge-row">
            <button type="button" class="chip-filter" :class="{ 'chip-filter--active': postsFilters.status === 'all' }" @click="setPostsStatus('all')">Все · {{ postCounts.total }}</button>
            <button type="button" class="chip-filter" :class="{ 'chip-filter--active': postsFilters.status === 'publish' }" @click="setPostsStatus('publish')">Опубликовано · {{ postCounts.published }}</button>
            <button type="button" class="chip-filter" :class="{ 'chip-filter--active': postsFilters.status === 'draft' }" @click="setPostsStatus('draft')">Черновики · {{ postCounts.draft }}</button>
            <button type="button" class="chip-filter" :class="{ 'chip-filter--active': postsFilters.status === 'archived' }" @click="setPostsStatus('archived')">Архив · {{ postCounts.archived }}</button>
          </div>

          <div class="toolbar">
            <input v-model="postsFilters.q" type="text" placeholder="Поиск по заголовку / URL" class="control control-grow" @keyup.enter="loadPosts" />
            <v-button small @click="loadPosts">Найти</v-button>
            <v-button small secondary @click="resetPostsFilters">Сбросить</v-button>
          </div>

          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Заголовок</th><th>Рубрики</th><th>Кластер</th><th>Статус</th><th>Обновлено</th><th>Действия</th></tr>
              </thead>
              <tbody>
                <tr v-for="post in posts" :key="post.id">
                  <td>
                    <div class="cell-main">{{ post.title || '(без заголовка)' }}</div>
                    <div v-if="post.url_path" class="cell-sub">{{ post.url_path }}</div>
                  </td>
                  <td>
                    <div v-if="Array.isArray(post.categories) && post.categories.length > 0" class="badge-row tight">
                      <span v-for="cat in post.categories" :key="cat.id" class="badge badge--gray">{{ cat.name }}</span>
                    </div>
                    <span v-else class="muted small">-</span>
                  </td>
                  <td>
                    <span v-if="post.cluster_name">{{ post.cluster_name }}</span>
                    <span v-else class="muted small">-</span>
                  </td>
                  <td><span class="badge" :class="postStatusBadge(post.status)">{{ postStatusLabel(post.status) }}</span></td>
                  <td>{{ formatDate(post.updated_at) }}</td>
                  <td>
                    <div class="actions-inline">
                      <a class="link small" :href="directusPostUrl(post.id)"><v-icon name="edit" x-small /> В Directus</a>
                      <a v-if="post.url_path && post.status === 'publish'" class="link small" :href="post.url_path" target="_blank" rel="noreferrer"><v-icon name="open_in_new" x-small /> На сайте</a>
                      <v-button v-if="post.status !== 'publish'" x-small :disabled="busy.postAction" @click="setPostStatus(post.id, 'publish')">Опубликовать</v-button>
                      <v-button v-else x-small secondary :disabled="busy.postAction" @click="setPostStatus(post.id, 'draft')">В черновик</v-button>
                      <v-button v-if="post.status !== 'archived'" x-small kind="danger" secondary :disabled="busy.postAction" @click="setPostStatus(post.id, 'archived')">В архив</v-button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="posts.length === 0" class="empty-state">
            <v-icon name="article" small />
            <p class="empty-title">Записей не найдено</p>
            <p class="empty-text">Опубликуйте статьи конвейера или измените фильтр.</p>
          </div>
        </div>
      </section>

      <!-- CONTEXT -->
      <section v-else-if="activeTab === 'context'" class="panel">
        <div class="card">
          <div class="card-head card-head--between">
            <div class="card-head"><v-icon name="add_business" small /><h3>Пары «поинт → значение»</h3></div>
            <v-button x-small kind="danger" secondary :disabled="busy.contextAction || contextItems.length === 0" @click="clearContext">Очистить всё</v-button>
          </div>
          <div class="toolbar">
            <input v-model="contextForm.key" type="text" placeholder="Поинт (например, адрес)" class="control control-grow" />
            <input v-model="contextForm.value" type="text" placeholder="Значение (например, Москва, ул. Ленина 1)" class="control control-grow" />
            <v-button small :disabled="busy.contextAction || !contextForm.key.trim() || !contextForm.value.trim()" @click="addContextItem">Добавить</v-button>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><v-icon name="label" small /><h3>Текущий контекст</h3></div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Поинт</th><th>Значение</th><th /></tr>
              </thead>
              <tbody>
                <tr v-for="row in contextItemsSorted" :key="row.id">
                  <td class="cell-main">{{ row.context_type }}</td>
                  <td>{{ row.name }}</td>
                  <td class="action-cell">
                    <v-button x-small kind="danger" secondary :disabled="busy.contextAction" @click="removeContextItem(row.id)">Удалить</v-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="contextItemsSorted.length === 0" class="empty-state">
          <v-icon name="business" small />
          <p class="empty-title">Контекст пока не заполнен</p>
          <p class="empty-text">Добавьте первый поинт и его значение. Например: «адрес» → «Москва, ...».</p>
        </div>
      </section>

      <!-- JOBS -->
      <section v-else class="panel">
        <div class="card">
          <div class="card-head card-head--between">
            <div class="card-head"><v-icon name="manage_history" small /><h3>Мониторинг задач</h3></div>
            <v-button x-small secondary @click="loadJobs"><v-icon name="refresh" small left />Обновить</v-button>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>ID</th><th>Тип</th><th>Статус</th><th>Прогресс</th><th>Шаг</th><th>Старт</th><th /></tr>
              </thead>
              <tbody>
                <tr v-for="job in jobs" :key="job.id">
                  <td>#{{ job.id }}</td>
                  <td>{{ job.kind }}</td>
                  <td><span class="badge" :class="jobBadgeClass(job.status)">{{ job.status }}</span></td>
                  <td>{{ job.progress }}/{{ job.total }}</td>
                  <td>{{ job.step || '-' }}</td>
                  <td>{{ formatDate(job.started_at) }}</td>
                  <td><v-button x-small secondary @click="watchJob(job.id)">Открыть</v-button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="jobs.length === 0" class="empty-state empty-state--compact">
            <v-icon name="manage_history" small />
            <p class="empty-title">Нет активных задач</p>
          </div>

          <div v-if="currentJob && Array.isArray(currentJob.log)" class="job-log">
            <h4>Лог задачи #{{ currentJob.id }}</h4>
            <ul>
              <li v-for="entry in currentJob.log" :key="`${entry.at}-${entry.step}-${entry.message}`">
                <span class="muted">{{ formatDate(entry.at) }}</span>
                <strong>{{ entry.step || '-' }}</strong>
                <span>{{ entry.message }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  </private-view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

const navGroups = [
  { key: "main", label: null, items: [{ id: "overview", label: "Обзор", icon: "dashboard" }] },
  {
    key: "pipeline",
    label: "Конвейер",
    items: [
      { id: "queries", label: "Запросы", icon: "manage_search" },
      { id: "clusters", label: "Кластеры", icon: "bubble_chart" },
      { id: "generate", label: "Генерация", icon: "auto_awesome" },
    ],
  },
  {
    key: "publications",
    label: "Публикации",
    items: [
      { id: "blog", label: "Блог сайта", icon: "article" },
    ],
  },
  {
    key: "system",
    label: "Система",
    items: [
      { id: "context", label: "Контекст компании", icon: "business" },
      { id: "jobs", label: "Задачи", icon: "manage_history" },
    ],
  },
];

const tabMeta = {
  overview: { title: "Обзор", intro: "Сводка конвейера, быстрые действия и доступ к SEO API." },
  queries: { title: "Запросы", intro: "Импорт сырых запросов и рабочий список релевантных фраз без минус-слов." },
  clusters: { title: "Кластеры", intro: "Кластеры запросов, состав фраз и обновление из новых некластеризированных запросов." },
  generate: { title: "Генерация", intro: "Выбор кластеров, генерация статей и публикация в одном разделе." },
  blog: { title: "Блог сайта", intro: "Записи блога в Directus: статусы, рубрики и переход к редактору." },
  context: { title: "Контекст компании", intro: "Произвольные пары «поинт → значение» для SEO-конвейера." },
  jobs: { title: "Задачи", intro: "Мониторинг фоновых задач и их логов." },
};

const defaultLlmModelOptions = ["gpt-5.5-pro", "gpt-5.1", "gpt-5-mini", "gpt-4.1", "gpt-4.1-mini"];
const defaultLlmEmbeddingOptions = ["text-embedding-3-small", "text-embedding-3-large"];
const defaultLlmImageOptions = ["gpt-image-2"];

const llmModelOptions = ref([...defaultLlmModelOptions]);
const llmEmbeddingOptions = ref([...defaultLlmEmbeddingOptions]);
const llmImageOptions = ref([...defaultLlmImageOptions]);

const planStatusOptions = [
  { value: "", label: "Все статусы" },
  { value: "pending_review", label: "На проверке" },
  { value: "ready_for_brief", label: "Одобрено" },
  { value: "approved", label: "Approved" },
  { value: "brief_created", label: "ТЗ создано" },
  { value: "in_content_generation", label: "В генерации" },
  { value: "content_generated", label: "Контент готов" },
  { value: "published", label: "Опубликовано" },
  { value: "rejected", label: "Отклонено" },
  { value: "needs_more_data", label: "Нужны данные" },
];

const articleStatusOptions = [
  { value: "", label: "Все статусы" },
  { value: "draft", label: "draft" },
  { value: "needs_review", label: "needs_review" },
  { value: "approved", label: "approved" },
  { value: "published", label: "published" },
  { value: "rejected", label: "rejected" },
];

const intentLabels = {
  commercial_service: "Коммерческий",
  commercial_local: "Локальный",
  commercial_price: "Цена",
  commercial_comparison: "Сравнение",
  informational_how_to: "Вопрос",
  informational_selection: "Выбор",
  informational_cost_estimation: "Расчёт стоимости",
  faq: "FAQ",
  case_or_example: "Пример",
  brand: "Бренд",
  competitor: "Конкурент",
  irrelevant: "Не подходит",
  unknown: "Не определён",
  commercial: "Коммерческий",
  informational: "Информационный",
  navigational: "Навигационный",
  transactional: "Транзакционный",
  local: "Локальный",
};

const actionLabels = {
  create_new_page: "Новая страница",
  update_existing_page: "Обновить существующую",
  add_faq_to_existing_page: "Добавить FAQ",
  add_section_to_existing_page: "Добавить раздел",
  merge_with_existing_cluster: "Объединить",
  no_action: "Без действия",
  manual_review: "Ручная проверка",
};

function getDirectusBasePath() {
  if (typeof window === "undefined") return "";
  const path = window.location.pathname || "";
  const adminMarker = "/admin";
  const adminIndex = path.indexOf(adminMarker);
  if (adminIndex > 0) return path.slice(0, adminIndex);
  return "";
}

const directusBasePath = getDirectusBasePath();
const bridgeBase = `${directusBasePath}/directus-extension-katet-seo-pipeline`;
const directusPostsUrl = `${directusBasePath}/admin/content/posts`;

function directusPostUrl(id) {
  return `${directusBasePath}/admin/content/posts/${id}`;
}

const activeTab = ref("overview");
const error = ref("");
const info = ref("");
const seoToken = ref("");

const autoDraftTop = ref(5);

const currentTitle = computed(() => tabMeta[activeTab.value]?.title || "SEO-конвейер");
const currentIntro = computed(() => tabMeta[activeTab.value]?.intro || "");

const busy = reactive({
  summary: false,
  pipeline: false,
  batch: false,
  jobs: false,
  queries: false,
  queryAction: false,
  clusterAction: false,
  clusterize: false,
  semanticsStats: false,
  semanticsRaw: false,
  semanticsNormalized: false,
  semanticsClusters: false,
  semanticsCleaning: false,
  openAiKey: false,
  llmModels: false,
  llmCatalog: false,
  semanticsWorkflow: false,
  import: false,
  siteIndex: false,
  plan: false,
  planAction: false,
  generatable: false,
  articles: false,
  articleAction: false,
  context: false,
  contextAction: false,
  posts: false,
  postAction: false,
});

const summary = reactive({
  mode: "csv",
  contextTotal: 0,
  rawTotal: 0,
  normalizedTotal: 0,
  clustersTotal: 0,
  planItems: 0,
  planPending: 0,
  planApproved: 0,
  planClosed: 0,
  planRejected: 0,
  articlesWork: 0,
  articlesDraft: 0,
  articlesPublished: 0,
  postsTotal: 0,
  postsPublished: 0,
  postsDraft: 0,
  jobsRunning: 0,
});

const jobs = ref([]);
const currentJob = ref(null);
let pollTimer = null;
let jobDoneHandler = null;

const queryFilters = reactive({ q: "", page: 1, pageSize: 100 });
const queriesPage = reactive({ items: [], total: 0, page: 1, pageSize: 100, totalPages: 1 });
const selectedQueryIds = ref([]);
const queryTargetClusterId = ref("");
const newQueryClusterName = ref("");
const clusterTargets = ref([]);

const selectedQuerySet = computed(() => new Set(selectedQueryIds.value));
const allQueriesSelected = computed(() => {
  if (queriesPage.items.length === 0) return false;
  return queriesPage.items.every((row) => selectedQuerySet.value.has(Number(row.id)));
});

const semanticsStats = reactive({
  mode: "csv",
  rawTotal: 0,
  rawWordstatApi: 0,
  rawCsv: 0,
  rawMock: 0,
  normalizedTotal: 0,
  normalizedRelevant: 0,
  normalizedIrrelevant: 0,
  clustersTotal: 0,
  planItems: 0,
  contentClosed: 0,
});

const semanticsFilters = reactive({ q: "", source: "all", relevance: "all", limit: 200 });
const semanticsRaw = ref([]);
const semanticsNormalized = ref([]);
const semanticsClusters = ref([]);

const cleaning = reactive({ min_frequency: 5, require_business_fit: true, junk_words_text: "" });
const openAiKey = reactive({
  input: "",
  hasKey: false,
  masked: "",
  source: "none",
  reveal: false,
});
const llmModels = reactive({
  cheap: "gpt-5.5-pro",
  strong: "gpt-5.5-pro",
  cluster: "gpt-4.1",
  embedding: "text-embedding-3-small",
  image: "gpt-image-2",
});
const llmCatalog = reactive({
  source: "fallback",
  textTotal: llmModelOptions.value.length,
  embeddingTotal: llmEmbeddingOptions.value.length,
  imageTotal: llmImageOptions.value.length,
  lastError: "",
});
const cleanJob = reactive({ jobId: null, running: false, progress: 0, message: "" });
const rebuildJob = reactive({ jobId: null, running: false, progress: 0, message: "" });
const clusterizeJob = reactive({ jobId: null, running: false, progress: 0, message: "" });

const importState = reactive({ content: "", seedTerm: "csv-import", region: "Москва", fileName: "", result: null, error: "" });

const siteIndex = reactive({ pages: 0, posts: 0, equipmentTypes: 0, workTypes: 0, brands: 0, total: 0 });

const clusterKeywordsState = reactive({});

const planStatus = ref("");
const planItems = ref([]);

const generatableClusters = ref([]);
const generateSelectedIds = ref([]);

const generateState = reactive({ jobId: null, running: false, progress: 0, logs: [], results: null, error: "" });

const allGeneratableSelected = computed(() => {
  if (generatableClusters.value.length === 0) return false;
  return generatableClusters.value.every((cluster) => generateSelectedIds.value.includes(Number(cluster.id)));
});

const articleStatus = ref("");
const articles = ref([]);

const editor = reactive({
  open: false,
  id: null,
  title: "",
  slug: "",
  seoTitle: "",
  metaDescription: "",
  bodyHtml: "",
  status: "draft",
  publishedPostId: null,
  saving: false,
  publishing: false,
});

const posts = ref([]);
const postsFilters = reactive({ q: "", status: "all" });
const postCounts = reactive({ total: 0, published: 0, draft: 0, archived: 0 });

const contextItems = ref([]);
const contextForm = reactive({ key: "", value: "" });
const contextItemsSorted = computed(() => [...contextItems.value].sort((a, b) => Number(b.id || 0) - Number(a.id || 0)));

const loadedTabs = reactive({
  overview: false,
  queries: false,
  clusters: false,
  generate: false,
  blog: false,
  context: false,
  jobs: false,
});

function navBadge(id) {
  if (id === "generate" && summary.articlesDraft > 0) return summary.articlesDraft;
  if (id === "jobs" && summary.jobsRunning > 0) return summary.jobsRunning;
  return null;
}

function selectTab(id) {
  activeTab.value = id;
}

function setError(message) {
  error.value = message || "";
  if (message) info.value = "";
}

function setInfo(message) {
  info.value = message || "";
  if (message) error.value = "";
}

function numberFormat(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.trunc(num)));
}

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
}

function intentLabel(intent) {
  if (!intent) return "-";
  return intentLabels[intent] || intent;
}

function actionLabel(action) {
  if (!action) return "-";
  return actionLabels[action] || action;
}

function openAiKeySourceLabel(source) {
  if (source === "db") return "из настроек";
  if (source === "env") return "из переменных окружения";
  return "не определён";
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function withRequiredValues(list, requiredValues) {
  const base = uniqueStrings(list);
  const required = uniqueStrings(requiredValues);
  for (const value of required) {
    if (!base.includes(value)) base.unshift(value);
  }
  return base;
}

function includeCurrentModelsInOptions() {
  llmModelOptions.value = withRequiredValues(llmModelOptions.value, [llmModels.strong, llmModels.cheap, llmModels.cluster]);
  llmEmbeddingOptions.value = withRequiredValues(llmEmbeddingOptions.value, [llmModels.embedding]);
  llmImageOptions.value = withRequiredValues(llmImageOptions.value, [llmModels.image]);
}

function updateModelCatalogMeta(meta = {}) {
  llmCatalog.source = String(meta.source || llmCatalog.source || "fallback");
  llmCatalog.textTotal = llmModelOptions.value.length;
  llmCatalog.embeddingTotal = llmEmbeddingOptions.value.length;
  llmCatalog.imageTotal = llmImageOptions.value.length;
  llmCatalog.lastError = String(meta.lastError || "");
}

function syncSelectedModelsWithOptions() {
  if (llmModelOptions.value.length > 0) {
    if (!llmModelOptions.value.includes(llmModels.strong)) llmModels.strong = llmModelOptions.value[0];
    if (!llmModelOptions.value.includes(llmModels.cheap)) llmModels.cheap = llmModelOptions.value[0];
    if (!llmModelOptions.value.includes(llmModels.cluster)) llmModels.cluster = llmModelOptions.value[0];
  }
  if (llmEmbeddingOptions.value.length > 0 && !llmEmbeddingOptions.value.includes(llmModels.embedding)) {
    llmModels.embedding = llmEmbeddingOptions.value[0];
  }
  if (llmImageOptions.value.length > 0 && !llmImageOptions.value.includes(llmModels.image)) {
    llmModels.image = llmImageOptions.value[0];
  }
}

function applyModelCatalogOptions(payload = {}, meta = {}) {
  const nextText = uniqueStrings(payload.text);
  const nextEmbedding = uniqueStrings(payload.embedding);
  const nextImage = uniqueStrings(payload.image);

  llmModelOptions.value = nextText.length > 0 ? nextText : [...defaultLlmModelOptions];
  llmEmbeddingOptions.value = nextEmbedding.length > 0 ? nextEmbedding : [...defaultLlmEmbeddingOptions];
  llmImageOptions.value = nextImage.length > 0 ? nextImage : [...defaultLlmImageOptions];

  includeCurrentModelsInOptions();
  updateModelCatalogMeta(meta);
  syncSelectedModelsWithOptions();
}

function contentStatusMeta(status) {
  if (status === "created") return { label: "Контент создан", badge: "badge--green" };
  if (status === "not_recommended") return { label: "Не рекомендован", badge: "badge--red" };
  return { label: "Ожидает контента", badge: "badge--amber" };
}

function planStatusLabel(status) {
  const labels = {
    pending_review: "На проверке",
    ready_for_brief: "Одобрено",
    approved: "Одобрено",
    brief_created: "ТЗ создано",
    in_content_generation: "В генерации",
    content_generated: "Контент закрыт",
    published: "Опубликовано",
    rejected: "Отклонено",
    needs_more_data: "Нужны данные",
  };
  return labels[status] || status || "-";
}

function planStatusBadge(status) {
  if (status === "content_generated" || status === "published") return "badge--green";
  if (status === "ready_for_brief" || status === "approved" || status === "brief_created") return "badge--blue";
  if (status === "pending_review") return "badge--amber";
  if (status === "rejected" || status === "needs_more_data") return "badge--red";
  return "badge--gray";
}

function articleStatusBadge(status) {
  if (status === "published") return "badge--green";
  if (status === "draft") return "badge--blue";
  if (status === "needs_review") return "badge--amber";
  if (status === "rejected") return "badge--red";
  return "badge--gray";
}

function postStatusLabel(status) {
  if (status === "publish") return "Опубликовано";
  if (status === "draft") return "Черновик";
  if (status === "archived") return "Архив";
  return status || "-";
}

function postStatusBadge(status) {
  if (status === "publish") return "badge--green";
  if (status === "draft") return "badge--blue";
  if (status === "archived") return "badge--gray";
  return "badge--gray";
}

function sourceBadgeClass(source) {
  if (source === "wordstat_api") return "badge--blue";
  if (source === "csv") return "badge--green";
  if (source === "mock") return "badge--red";
  return "badge--gray";
}

function relevanceLabel(value) {
  if (value === true) return "relevant";
  if (value === false) return "irrelevant";
  return "unknown";
}

function relevanceBadgeClass(value) {
  if (value === true) return "badge--green";
  if (value === false) return "badge--red";
  return "badge--gray";
}

function relatedSourceLabel(source) {
  if (source === "page") return "Страница";
  if (source === "post") return "Статья";
  if (source === "equipment_type") return "Услуга";
  if (source === "work_type") return "Тип работ";
  if (source === "brand") return "Категория";
  return source;
}

function clusterStatusMeta(cluster) {
  const status = cluster?.plan_status || null;
  const hasArticle = Boolean(cluster?.has_article);
  if (hasArticle || status === "content_generated" || status === "published") {
    return { label: "Контент создан", badge: "badge--green" };
  }
  if (status === "rejected" || status === "needs_more_data") {
    return { label: "Не рекомендован", badge: "badge--red" };
  }
  return { label: "Ожидает контента", badge: "badge--amber" };
}

function coverageMeta(cluster) {
  const score = Number(cluster?.coverage_score || 0);
  if (cluster?.has_article) return { label: "Закрыт статьёй", badge: "badge--green" };
  if (score >= 0.5 && cluster?.target_existing_url) return { label: "Покрыт страницей", badge: "badge--blue" };
  if (score >= 0.3 || (Array.isArray(cluster?.related_pages) && cluster.related_pages.length > 0)) {
    return { label: "Частично покрыт", badge: "badge--amber" };
  }
  return { label: "Новая тема", badge: "badge--gray" };
}

function jobBadgeClass(status) {
  if (status === "running") return "badge--blue";
  if (status === "done") return "badge--green";
  if (status === "error") return "badge--red";
  return "badge--gray";
}

function getJobProgress(job) {
  if (!job) return 0;
  const total = Number(job.total || 0);
  const progress = Number(job.progress || 0);
  if (total > 0) return Math.max(0, Math.min(100, Math.round((progress / total) * 100)));
  return job.status === "running" ? 5 : 0;
}

function lastLogMessage(job) {
  if (!job || !Array.isArray(job.log) || job.log.length === 0) return "";
  const last = job.log[job.log.length - 1];
  if (last && typeof last.message === "string") return last.message;
  return "";
}

function jobFailureReason(job) {
  if (job && typeof job.error === "string" && job.error.trim()) return job.error.trim();
  const fromLog = lastLogMessage(job);
  if (fromLog) return fromLog;
  return "Причина не указана";
}

function syncJobToPanels(job) {
  const jobId = Number(job?.id || 0);
  const progress = getJobProgress(job);
  const message = lastLogMessage(job);
  const running = job?.status === "running";

  if (jobId && clusterizeJob.jobId === jobId) {
    clusterizeJob.progress = progress;
    clusterizeJob.message = message;
    clusterizeJob.running = running;
  }
  if (jobId && cleanJob.jobId === jobId) {
    cleanJob.progress = progress;
    cleanJob.message = message;
    cleanJob.running = running;
  }
  if (jobId && rebuildJob.jobId === jobId) {
    rebuildJob.progress = progress;
    rebuildJob.message = message;
    rebuildJob.running = running;
  }
  if (jobId && generateState.jobId === jobId) {
    generateState.progress = progress;
    generateState.running = running;
    generateState.logs = Array.isArray(job.log)
      ? job.log.map((entry) => (entry && typeof entry.message === "string" ? entry.message : "")).filter(Boolean)
      : [];
  }
}

function clearPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function api(path, options = {}) {
  const response = await fetch(`${bridgeBase}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(seoToken.value.trim() ? { "x-seo-token": seoToken.value.trim() } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.raw || `Request failed (${response.status})`);
  }
  return payload;
}

async function watchJob(jobId, onDone = null) {
  try {
    const first = await api(`/jobs/${jobId}`);
    currentJob.value = first;
    syncJobToPanels(first);
    jobDoneHandler = typeof onDone === "function" ? onDone : null;

    if (first?.status !== "running") {
      const handler = jobDoneHandler;
      jobDoneHandler = null;
      if (handler) await handler(first);
      await Promise.all([loadSummary(), loadJobs()]);
      if (first?.status === "error") {
        setError(`Задача #${jobId} завершилась с ошибкой: ${jobFailureReason(first)}`);
      }
      return;
    }

    clearPolling();
    pollTimer = window.setInterval(async () => {
      try {
        const next = await api(`/jobs/${jobId}`);
        currentJob.value = next;
        syncJobToPanels(next);

        if (next?.status !== "running") {
          clearPolling();
          const handler = jobDoneHandler;
          jobDoneHandler = null;
          if (handler) await handler(next);
          await Promise.all([loadSummary(), loadJobs()]);
          if (next?.status === "error") {
            setError(`Задача #${jobId} завершилась с ошибкой: ${jobFailureReason(next)}`);
          }
        }
      } catch (err) {
        clearPolling();
        setError(err instanceof Error ? err.message : "Ошибка polling jobs");
      }
    }, 2000);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось получить job");
  }
}

async function loadSummary() {
  busy.summary = true;
  try {
    const data = await api("/summary");
    summary.mode = data.mode || "csv";
    summary.contextTotal = Number(data.contextTotal || 0);
    summary.rawTotal = Number(data.rawTotal || 0);
    summary.normalizedTotal = Number(data.normalizedTotal || 0);
    summary.clustersTotal = Number(data.clustersTotal || 0);
    summary.planItems = Number(data.planItems || 0);
    summary.planPending = Number(data.planPending || 0);
    summary.planApproved = Number(data.planApproved || 0);
    summary.planClosed = Number(data.planClosed || 0);
    summary.planRejected = Number(data.planRejected || 0);
    summary.articlesWork = Number(data.articlesWork || 0);
    summary.articlesDraft = Number(data.articlesDraft || 0);
    summary.articlesPublished = Number(data.articlesPublished || 0);
    summary.postsTotal = Number(data.postsTotal || 0);
    summary.postsPublished = Number(data.postsPublished || 0);
    summary.postsDraft = Number(data.postsDraft || 0);
    summary.jobsRunning = Number(data.jobsRunning || 0);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить summary");
  } finally {
    busy.summary = false;
  }
}

async function loadJobs() {
  busy.jobs = true;
  try {
    const data = await api("/jobs?limit=60");
    jobs.value = Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить jobs");
  } finally {
    busy.jobs = false;
  }
}

async function loadQueries() {
  busy.queries = true;
  try {
    const params = new URLSearchParams();
    if (queryFilters.q.trim()) params.set("q", queryFilters.q.trim());
    params.set("page", String(queryFilters.page));
    params.set("pageSize", String(queryFilters.pageSize));

    const data = await api(`/queries?${params.toString()}`);
    queriesPage.items = Array.isArray(data.items) ? data.items : [];
    queriesPage.total = Number(data.total || 0);
    queriesPage.page = Number(data.page || queryFilters.page);
    queriesPage.pageSize = Number(data.pageSize || queryFilters.pageSize);
    queriesPage.totalPages = Number(data.totalPages || 1);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить queries");
  } finally {
    busy.queries = false;
  }
}

async function loadClusterTargets() {
  try {
    const data = await api("/cluster-targets?limit=500");
    clusterTargets.value = Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить cluster targets");
  }
}

function applyQueriesFilters() {
  queryFilters.page = 1;
  void loadQueries();
}

function resetQueriesFilters() {
  queryFilters.q = "";
  queryFilters.page = 1;
  queryFilters.pageSize = 100;
  selectedQueryIds.value = [];
  void loadQueries();
}

function goToQueriesPage(nextPage) {
  const page = clamp(nextPage, 1, Math.max(1, queriesPage.totalPages));
  queryFilters.page = page;
  void loadQueries();
}

function toggleQuerySelection(id, checked) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return;
  if (checked) {
    if (!selectedQueryIds.value.includes(numericId)) selectedQueryIds.value = [...selectedQueryIds.value, numericId];
    return;
  }
  selectedQueryIds.value = selectedQueryIds.value.filter((item) => item !== numericId);
}

function toggleAllQueries(checked) {
  if (!checked) {
    const visibleIds = queriesPage.items.map((row) => Number(row.id));
    selectedQueryIds.value = selectedQueryIds.value.filter((id) => !visibleIds.includes(id));
    return;
  }
  const set = new Set(selectedQueryIds.value);
  for (const row of queriesPage.items) set.add(Number(row.id));
  selectedQueryIds.value = Array.from(set);
}

async function mergeQueriesToExisting() {
  if (selectedQueryIds.value.length === 0) return;
  if (!queryTargetClusterId.value) {
    setError("Выберите кластер для объединения");
    return;
  }
  busy.queryAction = true;
  try {
    await api("/queries", {
      method: "POST",
      body: { action: "merge", queryIds: selectedQueryIds.value, targetClusterId: Number(queryTargetClusterId.value) },
    });
    selectedQueryIds.value = [];
    setInfo("Запросы объединены в выбранный кластер");
    await Promise.all([loadQueries(), loadClusterTargets(), loadSemanticsStats(), loadSemanticsClusters()]);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось объединить запросы");
  } finally {
    busy.queryAction = false;
  }
}

async function mergeQueriesToNew() {
  if (selectedQueryIds.value.length === 0) return;
  busy.queryAction = true;
  try {
    await api("/queries", {
      method: "POST",
      body: { action: "merge", queryIds: selectedQueryIds.value, clusterName: newQueryClusterName.value.trim() || null },
    });
    selectedQueryIds.value = [];
    newQueryClusterName.value = "";
    setInfo("Запросы объединены в новый кластер");
    await Promise.all([loadQueries(), loadClusterTargets(), loadSemanticsStats(), loadSemanticsClusters()]);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось объединить запросы");
  } finally {
    busy.queryAction = false;
  }
}

async function deleteQueries(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  if (!window.confirm(`Удалить запросов: ${ids.length}?`)) return;
  busy.queryAction = true;
  try {
    await api("/queries", { method: "DELETE", body: { queryIds: ids } });
    selectedQueryIds.value = selectedQueryIds.value.filter((id) => !ids.includes(id));
    setInfo(`Удалено запросов: ${ids.length}`);
    await Promise.all([loadQueries(), loadClusterTargets(), loadSemanticsStats(), loadSemanticsClusters()]);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось удалить запросы");
  } finally {
    busy.queryAction = false;
  }
}

function deleteSelectedQueries() {
  void deleteQueries(selectedQueryIds.value.slice());
}

function deleteOneQuery(id) {
  void deleteQueries([Number(id)]);
}

async function startClusterize() {
  if (!window.confirm("Обновить кластеры из новых некластеризированных запросов с помощью ИИ?")) return;
  busy.clusterize = true;
  try {
    const data = await api("/clusterize", { method: "POST", body: { rebuild: false, requireAi: true } });
    const jobId = Number(data.jobId || 0);
    if (!jobId) throw new Error("Не удалось получить ID задачи");

    clusterizeJob.jobId = jobId;
    clusterizeJob.running = true;
    clusterizeJob.progress = 0;
    clusterizeJob.message = "Обновление кластеров…";

    setInfo(`Обновление кластеров запущено. Job #${jobId}`);
    await loadJobs();
    await watchJob(jobId, async () => {
      await Promise.all([
        loadSummary(),
        loadQueries(),
        loadClusterTargets(),
        loadSemanticsClusters(),
        loadPlan(),
        loadGeneratableClusters(),
        loadArticles(),
      ]);
    });
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось обновить кластеры");
  } finally {
    busy.clusterize = false;
  }
}

async function loadSemanticsStats() {
  busy.semanticsStats = true;
  try {
    const data = await api("/semantics/stats");
    semanticsStats.mode = data.mode || "csv";
    semanticsStats.rawTotal = Number(data.rawTotal || 0);
    semanticsStats.rawWordstatApi = Number(data.rawWordstatApi || 0);
    semanticsStats.rawCsv = Number(data.rawCsv || 0);
    semanticsStats.rawMock = Number(data.rawMock || 0);
    semanticsStats.normalizedTotal = Number(data.normalizedTotal || 0);
    semanticsStats.normalizedRelevant = Number(data.normalizedRelevant || 0);
    semanticsStats.normalizedIrrelevant = Number(data.normalizedIrrelevant || 0);
    semanticsStats.clustersTotal = Number(data.clustersTotal || 0);
    semanticsStats.planItems = Number(data.planItems || 0);
    semanticsStats.contentClosed = Number(data.contentClosed || 0);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить semantics stats");
  } finally {
    busy.semanticsStats = false;
  }
}

async function loadSemanticsRaw() {
  busy.semanticsRaw = true;
  try {
    const params = new URLSearchParams();
    if (semanticsFilters.q.trim()) params.set("q", semanticsFilters.q.trim());
    if (semanticsFilters.source.trim()) params.set("source", semanticsFilters.source.trim());
    params.set("limit", String(clamp(semanticsFilters.limit, 20, 1000)));

    const data = await api(`/semantics/raw?${params.toString()}`);
    semanticsRaw.value = Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить raw keywords");
  } finally {
    busy.semanticsRaw = false;
  }
}

async function loadSemanticsNormalized() {
  busy.semanticsNormalized = true;
  try {
    const params = new URLSearchParams();
    if (semanticsFilters.q.trim()) params.set("q", semanticsFilters.q.trim());
    if (semanticsFilters.source.trim()) params.set("source", semanticsFilters.source.trim());
    if (semanticsFilters.relevance.trim()) params.set("relevance", semanticsFilters.relevance.trim());
    params.set("limit", String(clamp(semanticsFilters.limit, 20, 1000)));

    const data = await api(`/semantics/normalized?${params.toString()}`);
    semanticsNormalized.value = Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить normalized keywords");
  } finally {
    busy.semanticsNormalized = false;
  }
}

async function loadSemanticsClusters() {
  busy.semanticsClusters = true;
  try {
    const limit = clamp(semanticsFilters.limit, 20, 500);
    const data = await api(`/semantics/clusters?limit=${limit}`);
    semanticsClusters.value = Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить clusters");
  } finally {
    busy.semanticsClusters = false;
  }
}

async function loadCleaningSettings() {
  try {
    const data = await api("/semantics/cleaning");
    const settings = data?.settings || {};
    cleaning.min_frequency = Number(settings.min_frequency || 5);
    cleaning.require_business_fit = settings.require_business_fit !== false;
    cleaning.junk_words_text = Array.isArray(settings.junk_words) ? settings.junk_words.join("\n") : "";
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить правила очистки");
  }
}

async function loadLlmModelCatalog(options = {}) {
  const silent = options?.silent === true;
  busy.llmCatalog = true;
  try {
    const data = await api("/settings/models/catalog");
    applyModelCatalogOptions(data?.options || {}, {
      source: String(data?.key?.source || "db"),
      lastError: "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "model_catalog_request_failed";
    applyModelCatalogOptions({}, { source: "fallback", lastError: message });
    if (!/openai_key_not_configured/i.test(message) && !silent) {
      setError(`Не удалось получить каталог моделей OpenAI: ${message}`);
    }
  } finally {
    busy.llmCatalog = false;
  }
}

async function loadLlmModels() {
  busy.llmModels = true;
  try {
    const data = await api("/settings/models");
    const models = data?.models || {};
    llmModels.cheap = String(models.cheap || llmModels.cheap);
    llmModels.strong = String(models.strong || llmModels.strong);
    llmModels.cluster = String(models.cluster || llmModels.cluster);
    llmModels.embedding = String(models.embedding || llmModels.embedding);
    llmModels.image = String(models.image || llmModels.image);
    includeCurrentModelsInOptions();
    syncSelectedModelsWithOptions();
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить LLM-модели");
  } finally {
    busy.llmModels = false;
  }
}

async function loadOpenAiKey() {
  busy.openAiKey = true;
  try {
    const data = await api("/settings/openai-key");
    openAiKey.hasKey = Boolean(data?.hasKey);
    openAiKey.masked = String(data?.masked || "");
    openAiKey.source = String(data?.source || "none");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить OpenAI API key");
  } finally {
    busy.openAiKey = false;
  }
}

async function saveOpenAiKey() {
  if (!openAiKey.input.trim()) return;
  busy.openAiKey = true;
  try {
    await api("/settings/openai-key", {
      method: "POST",
      body: { apiKey: String(openAiKey.input || "").trim() },
    });
    openAiKey.input = "";
    openAiKey.reveal = false;
    await Promise.all([loadOpenAiKey(), loadLlmModelCatalog({ silent: true })]);
    setInfo("OpenAI API key сохранён");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось сохранить OpenAI API key");
  } finally {
    busy.openAiKey = false;
  }
}

async function clearOpenAiKey() {
  if (!window.confirm("Удалить сохранённый OpenAI API key?")) return;
  busy.openAiKey = true;
  try {
    await api("/settings/openai-key", { method: "DELETE" });
    openAiKey.input = "";
    openAiKey.reveal = false;
    await Promise.all([loadOpenAiKey(), loadLlmModelCatalog({ silent: true })]);
    setInfo("OpenAI API key удалён");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось удалить OpenAI API key");
  } finally {
    busy.openAiKey = false;
  }
}

async function reloadLlmSettings(options = {}) {
  const silent = options?.silent === true;
  await Promise.all([loadLlmModelCatalog({ silent }), loadLlmModels()]);
}

async function saveLlmModels() {
  busy.llmModels = true;
  try {
    syncSelectedModelsWithOptions();
    const payload = {
      cheap: String(llmModels.cheap || "").trim(),
      strong: String(llmModels.strong || "").trim(),
      cluster: String(llmModels.cluster || "").trim(),
      embedding: String(llmModels.embedding || "").trim(),
      image: String(llmModels.image || "").trim(),
    };
    await api("/settings/models", { method: "POST", body: { models: payload } });
    setInfo("LLM-модели сохранены");
    await reloadLlmSettings({ silent: true });
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось сохранить LLM-модели");
  } finally {
    busy.llmModels = false;
  }
}

async function reloadSemanticsAll() {
  await Promise.all([loadSemanticsStats(), loadSemanticsRaw(), loadSemanticsNormalized(), loadSemanticsClusters()]);
}

async function applySemanticsFilters() {
  semanticsFilters.limit = clamp(semanticsFilters.limit, 20, 1000);
  await Promise.all([loadSemanticsRaw(), loadSemanticsNormalized(), loadSemanticsClusters()]);
}

function parseJunkWords() {
  return cleaning.junk_words_text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function saveCleaningSettings() {
  busy.semanticsCleaning = true;
  try {
    await api("/semantics/cleaning", {
      method: "POST",
      body: {
        settings: {
          min_frequency: clamp(cleaning.min_frequency, 1, 100000),
          require_business_fit: Boolean(cleaning.require_business_fit),
          junk_words: parseJunkWords(),
        },
        run: false,
      },
    });
    setInfo("Правила очистки сохранены");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось сохранить правила");
  } finally {
    busy.semanticsCleaning = false;
  }
}

async function runCleaningPipeline() {
  if (!window.confirm("Запустить очистку и классификацию семантики по текущим правилам?")) return;
  busy.semanticsCleaning = true;
  try {
    const data = await api("/semantics/cleaning", {
      method: "POST",
      body: {
        settings: {
          min_frequency: clamp(cleaning.min_frequency, 1, 100000),
          require_business_fit: Boolean(cleaning.require_business_fit),
          junk_words: parseJunkWords(),
        },
        run: true,
      },
    });

    const jobId = Number(data.jobId || 0);
    if (!jobId) throw new Error("Не удалось получить ID задачи");

    cleanJob.jobId = jobId;
    cleanJob.running = true;
    cleanJob.progress = 0;
    cleanJob.message = "Очистка запущена…";

    await loadJobs();
    await watchJob(jobId, async () => {
      await Promise.all([loadSummary(), loadSemanticsStats(), loadSemanticsRaw(), loadSemanticsNormalized(), loadQueries()]);
    });
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось запустить очистку");
  } finally {
    busy.semanticsCleaning = false;
  }
}

async function startSemanticsRebuild() {
  busy.semanticsWorkflow = true;
  try {
    const data = await api("/semantics/rebuild", { method: "POST", body: {} });
    const jobId = Number(data.jobId || 0);
    if (!jobId) throw new Error("Не удалось получить ID задачи");

    rebuildJob.jobId = jobId;
    rebuildJob.running = true;
    rebuildJob.progress = 0;
    rebuildJob.message = "Обработка семантики…";

    await loadJobs();
    await watchJob(jobId, async () => {
      await Promise.all([
        loadSummary(),
        loadSemanticsStats(),
        loadSemanticsRaw(),
        loadSemanticsNormalized(),
        loadSemanticsClusters(),
        loadQueries(),
        loadPlan(),
        loadGeneratableClusters(),
      ]);
    });
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось запустить обработку семантики");
  } finally {
    busy.semanticsWorkflow = false;
  }
}

async function startWorkflowBatchGeneration() {
  generateSelectedIds.value = [];
  await startBatchGeneration();
}

async function purgeMockData() {
  const ok = window.confirm("Удалить mock-данные семантики? Это удалит raw mock-запросы и сбросит кластеры, контент-план, брифы и статьи.");
  if (!ok) return;
  busy.semanticsWorkflow = true;
  try {
    const data = await api("/semantics/purge-mock", { method: "POST", body: {} });
    setInfo(`Готово: удалено mock raw-запросов: ${Number(data.removedRawMock || 0)}`);
    await Promise.all([
      loadSummary(),
      loadSemanticsStats(),
      loadSemanticsRaw(),
      loadSemanticsNormalized(),
      loadSemanticsClusters(),
      loadQueries(),
      loadClusterTargets(),
      loadPlan(),
      loadArticles(),
      loadGeneratableClusters(),
    ]);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось удалить mock-данные");
  } finally {
    busy.semanticsWorkflow = false;
  }
}

function decodeFileBuffer(buffer) {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount > 0) {
    try {
      return new TextDecoder("windows-1251").decode(buffer);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

async function handleImportFileChange(event) {
  const file = event?.target?.files?.[0] || null;
  if (!file) return;
  importState.error = "";
  importState.result = null;
  try {
    const text = decodeFileBuffer(await file.arrayBuffer());
    importState.content = text;
    importState.fileName = file.name;
    if (importState.seedTerm === "csv-import") {
      importState.seedTerm = file.name.replace(/\.[^.]+$/, "") || "csv-import";
    }
  } catch (err) {
    importState.error = err instanceof Error ? err.message : "Не удалось прочитать файл";
  }
}

async function runImport() {
  if (!importState.content.trim()) return;
  busy.import = true;
  importState.error = "";
  importState.result = null;
  try {
    const data = await api("/keywords/import", {
      method: "POST",
      body: { content: importState.content, seedTerm: importState.seedTerm.trim() || "csv-import", region: importState.region.trim() || null },
    });
    importState.result = {
      imported: Number(data.imported || 0),
      parsed: data.parsed != null ? Number(data.parsed) : null,
      filteredByMinusWords: Number(data.filteredByMinusWords || 0),
      cleaned: data.cleaned != null ? Number(data.cleaned) : null,
      mode: data.mode || null,
    };
    const removedPart = importState.result.filteredByMinusWords > 0
      ? `, исключено по минус-словам: ${importState.result.filteredByMinusWords}`
      : "";
    setInfo(`Импорт завершён: ${importState.result.imported} строк${removedPart}`);
    await Promise.all([loadSummary(), loadQueries(), loadClusterTargets()]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ошибка импорта";
    importState.error = message;
    setError(message);
  } finally {
    busy.import = false;
  }
}

async function loadSiteIndex() {
  busy.siteIndex = true;
  try {
    const data = await api("/site-index");
    siteIndex.pages = Number(data.pages || 0);
    siteIndex.posts = Number(data.posts || 0);
    siteIndex.equipmentTypes = Number(data.equipmentTypes || 0);
    siteIndex.workTypes = Number(data.workTypes || 0);
    siteIndex.brands = Number(data.brands || 0);
    siteIndex.total = Number(data.total || 0);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить индекс сайта");
  } finally {
    busy.siteIndex = false;
  }
}

function getClusterKeywordsState(clusterId) {
  const key = String(clusterId);
  if (!clusterKeywordsState[key]) {
    clusterKeywordsState[key] = { expanded: false, loading: false, error: "", items: [], removingId: null };
  }
  return clusterKeywordsState[key];
}

async function loadClusterKeywords(clusterId) {
  const state = getClusterKeywordsState(clusterId);
  state.loading = true;
  state.error = "";
  try {
    const data = await api(`/clusters/${clusterId}/keywords`);
    state.items = Array.isArray(data.keywords) ? data.keywords : [];
  } catch (err) {
    state.error = err instanceof Error ? err.message : "Не удалось загрузить запросы кластера";
  } finally {
    state.loading = false;
  }
}

async function toggleClusterKeywords(clusterId) {
  const state = getClusterKeywordsState(clusterId);
  if (!state.expanded && state.items.length === 0) {
    await loadClusterKeywords(clusterId);
  }
  state.expanded = !state.expanded;
}

async function removeKeywordFromCluster(clusterId, keywordId) {
  if (!window.confirm("Убрать этот запрос из кластера?")) return;
  const state = getClusterKeywordsState(clusterId);
  state.removingId = Number(keywordId);
  state.error = "";
  try {
    await api(`/clusters/${clusterId}/keywords`, { method: "DELETE", body: { keywordId } });
    state.items = state.items.filter((item) => Number(item.keyword_id) !== Number(keywordId));
    await Promise.all([loadSemanticsClusters(), loadQueries(), loadSemanticsStats(), loadClusterTargets()]);
  } catch (err) {
    state.error = err instanceof Error ? err.message : "Не удалось убрать запрос из кластера";
  } finally {
    state.removingId = null;
  }
}

async function deleteCluster(cluster) {
  const id = Number(cluster?.id || 0);
  if (!id) return;

  if (cluster?.has_article) {
    setError("Нельзя удалить кластер, для которого уже создана статья. Сначала удалите или перенесите статью.");
    return;
  }

  const label = cluster?.cluster_name || cluster?.primary_keyword || `#${id}`;
  const ok = window.confirm(
    `Удалить кластер «${label}»? Будут удалены связи с запросами и элементы контент-плана для этого кластера.`,
  );
  if (!ok) return;

  busy.clusterAction = true;
  try {
    await api(`/clusters/${id}`, { method: "DELETE" });
    delete clusterKeywordsState[String(id)];
    generateSelectedIds.value = generateSelectedIds.value.filter((value) => Number(value) !== id);
    setInfo(`Кластер #${id} удалён`);
    await Promise.all([
      loadSummary(),
      loadSemanticsStats(),
      loadSemanticsClusters(),
      loadQueries(),
      loadClusterTargets(),
      loadPlan(),
      loadGeneratableClusters(),
    ]);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось удалить кластер");
  } finally {
    busy.clusterAction = false;
  }
}

async function loadPlan() {
  busy.plan = true;
  try {
    const status = planStatus.value ? `&status=${encodeURIComponent(planStatus.value)}` : "";
    const data = await api(`/plan?limit=120${status}`);
    planItems.value = Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить content plan");
  } finally {
    busy.plan = false;
  }
}

async function reviewPlan(planId, action, extra = {}) {
  busy.planAction = true;
  try {
    await api(`/plan/${planId}/review`, { method: "POST", body: { action, reviewer: "directus-admin", ...extra } });
    setInfo(`Элемент плана #${planId}: ${action}`);
    await Promise.all([loadSummary(), loadPlan(), loadSemanticsClusters()]);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось отправить решение по плану");
  } finally {
    busy.planAction = false;
  }
}

async function rejectPlan(planId) {
  const reason = window.prompt("Причина отклонения", "manual_review") || "manual_review";
  await reviewPlan(planId, "reject", { reject_reason: reason });
}

async function createBrief(planId) {
  busy.planAction = true;
  try {
    const data = await api(`/plan/${planId}/brief`, { method: "POST", body: {} });
    setInfo(`Для элемента #${planId} создан brief #${data.briefId || "?"}`);
    await Promise.all([loadSummary(), loadPlan()]);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось создать brief");
  } finally {
    busy.planAction = false;
  }
}

async function createArticle(planId) {
  busy.planAction = true;
  try {
    const data = await api(`/plan/${planId}/article`, { method: "POST", body: {} });
    setInfo(`Для элемента #${planId} создана статья #${data.articleId || "?"}`);
    await Promise.all([loadSummary(), loadPlan(), loadArticles(), loadGeneratableClusters()]);
    if (data.articleId) await openEditor(Number(data.articleId));
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось создать статью");
  } finally {
    busy.planAction = false;
  }
}

async function loadGeneratableClusters() {
  busy.generatable = true;
  try {
    const data = await api("/generatable-clusters");
    generatableClusters.value = Array.isArray(data.items) ? data.items : [];
    generateSelectedIds.value = generateSelectedIds.value.filter((id) =>
      generatableClusters.value.some((cluster) => Number(cluster.id) === Number(id)),
    );
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить кластеры для генерации");
  } finally {
    busy.generatable = false;
  }
}

function toggleGenerateCluster(clusterId) {
  const id = Number(clusterId);
  if (!Number.isFinite(id)) return;
  if (generateSelectedIds.value.includes(id)) {
    generateSelectedIds.value = generateSelectedIds.value.filter((item) => item !== id);
    return;
  }
  generateSelectedIds.value = [...generateSelectedIds.value, id];
}

function toggleAllGenerateClusters() {
  if (allGeneratableSelected.value) {
    generateSelectedIds.value = [];
    return;
  }
  generateSelectedIds.value = generatableClusters.value.map((cluster) => Number(cluster.id));
}

async function loadGeneratedDraftsByClusters(clusterIds) {
  if (!Array.isArray(clusterIds) || clusterIds.length === 0) {
    generateState.results = [];
    return;
  }
  try {
    const data = await api("/articles/by-clusters", { method: "POST", body: { clusterIds } });
    generateState.results = Array.isArray(data.drafts) ? data.drafts : [];
  } catch {
    generateState.results = [];
  }
}

async function startBatchGeneration() {
  busy.batch = true;
  generateState.error = "";
  generateState.results = null;
  generateState.logs = [];
  generateState.progress = 0;

  const clusterIds = generateSelectedIds.value.slice();
  const limit = clusterIds.length > 0 ? clusterIds.length : 1;

  try {
    const payload = { limit, ...(clusterIds.length > 0 ? { clusterIds } : {}) };
    const data = await api("/articles/generate-batch", { method: "POST", body: payload });

    const jobId = Number(data.jobId || 0);
    if (!jobId) throw new Error("Не удалось получить ID задачи");

    generateState.jobId = jobId;
    generateState.running = true;
    generateState.progress = 0;
    setInfo(`Пакетная генерация запущена. Job #${jobId}`);

    await loadJobs();
    await watchJob(jobId, async (job) => {
      await Promise.all([loadSummary(), loadArticles(), loadPlan(), loadGeneratableClusters()]);
      await loadGeneratedDraftsByClusters(clusterIds);
      if (job?.status === "error") {
        generateState.error = jobFailureReason(job);
      }
    });
  } catch (err) {
    generateState.error = err instanceof Error ? err.message : "Не удалось запустить пакетную генерацию";
    setError(generateState.error);
  } finally {
    busy.batch = false;
  }
}

async function startBatchFromOverview() {
  generateSelectedIds.value = [];
  await startBatchGeneration();
}

async function startFullPipeline() {
  busy.pipeline = true;
  try {
    const auto = clamp(autoDraftTop.value, 0, 20);
    const data = await api("/pipeline/run", { method: "POST", body: { autoDraftTop: auto } });
    const jobId = Number(data.jobId || 0);
    if (!jobId) throw new Error("Не удалось получить ID задачи");

    setInfo(`Полный pipeline запущен. Job #${jobId}`);
    await loadJobs();
    await watchJob(jobId, async () => {
      await Promise.all([
        loadSummary(),
        loadQueries(),
        loadClusterTargets(),
        loadSemanticsStats(),
        loadSemanticsClusters(),
        loadPlan(),
        loadArticles(),
        loadGeneratableClusters(),
      ]);
    });
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось запустить pipeline");
  } finally {
    busy.pipeline = false;
  }
}

async function loadArticles() {
  busy.articles = true;
  try {
    const statusQuery = articleStatus.value ? `&status=${encodeURIComponent(articleStatus.value)}` : "";
    const data = await api(`/articles?limit=120${statusQuery}`);
    articles.value = Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить articles");
  } finally {
    busy.articles = false;
  }
}

async function openEditor(articleId) {
  const id = Number(articleId);
  if (!Number.isFinite(id) || id <= 0) return;
  try {
    const data = await api(`/articles/${id}`);
    editor.open = true;
    editor.id = Number(data.id);
    editor.title = data.title || "";
    editor.slug = data.slug || "";
    editor.seoTitle = data.seo_title || "";
    editor.metaDescription = data.meta_description || "";
    editor.bodyHtml = data.body_html || "";
    editor.status = data.status || "draft";
    editor.publishedPostId = data.published_post_id || null;
    activeTab.value = "generate";
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить статью");
  }
}

function closeEditor() {
  editor.open = false;
  editor.id = null;
}

async function saveEditor() {
  if (!editor.id) return;
  editor.saving = true;
  try {
    await api(`/articles/${editor.id}`, {
      method: "PATCH",
      body: {
        title: editor.title,
        slug: editor.slug,
        seo_title: editor.seoTitle,
        meta_description: editor.metaDescription,
        body_html: editor.bodyHtml,
        status: editor.status,
      },
    });
    setInfo(`Статья #${editor.id} сохранена`);
    await loadArticles();
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось сохранить статью");
  } finally {
    editor.saving = false;
  }
}

async function publish(articleId) {
  const id = Number(articleId);
  if (!id) return;
  editor.publishing = true;
  busy.articleAction = true;
  try {
    if (editor.open && editor.id === id) {
      await saveEditor();
    }
    const data = await api(`/articles/${id}/publish`, { method: "POST", body: {} });
    if (data.postId) editor.publishedPostId = Number(data.postId);
    setInfo(`Статья #${id} опубликована. Запись блога #${data.postId || "?"}`);
    await Promise.all([loadSummary(), loadArticles(), loadPlan(), loadGeneratableClusters()]);
    if (loadedTabs.blog) await loadPosts();
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось опубликовать статью");
  } finally {
    editor.publishing = false;
    busy.articleAction = false;
  }
}

async function deleteDraft(articleId) {
  const id = Number(articleId);
  if (!id) return;
  if (!window.confirm(`Удалить черновик статьи #${id}? Действие нельзя отменить.`)) return;

  busy.articleAction = true;
  try {
    await api(`/articles/${id}`, { method: "DELETE" });
    if (editor.open && Number(editor.id) === id) {
      closeEditor();
    }
    setInfo(`Черновик #${id} удалён`);
    await Promise.all([loadSummary(), loadArticles(), loadPlan(), loadGeneratableClusters()]);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось удалить черновик");
  } finally {
    busy.articleAction = false;
  }
}

async function loadPosts() {
  busy.posts = true;
  try {
    const params = new URLSearchParams();
    if (postsFilters.q.trim()) params.set("q", postsFilters.q.trim());
    if (postsFilters.status && postsFilters.status !== "all") params.set("status", postsFilters.status);
    params.set("limit", "100");

    const data = await api(`/posts?${params.toString()}`);
    posts.value = Array.isArray(data.items) ? data.items : [];
    const counts = data.counts || {};
    postCounts.total = Number(counts.total || 0);
    postCounts.published = Number(counts.published || 0);
    postCounts.draft = Number(counts.draft || 0);
    postCounts.archived = Number(counts.archived || 0);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить записи блога");
  } finally {
    busy.posts = false;
  }
}

function setPostsStatus(status) {
  postsFilters.status = status;
  void loadPosts();
}

function resetPostsFilters() {
  postsFilters.q = "";
  postsFilters.status = "all";
  void loadPosts();
}

async function setPostStatus(postId, status) {
  busy.postAction = true;
  try {
    await api(`/posts/${postId}/status`, { method: "POST", body: { status } });
    setInfo(`Запись #${postId}: статус ${status}`);
    await Promise.all([loadPosts(), loadSummary()]);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось изменить статус записи");
  } finally {
    busy.postAction = false;
  }
}

async function loadContext() {
  busy.context = true;
  try {
    const data = await api("/context");
    contextItems.value = Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось загрузить контекст");
  } finally {
    busy.context = false;
  }
}

async function addContextItem() {
  if (!contextForm.key.trim() || !contextForm.value.trim()) return;
  busy.contextAction = true;
  try {
    await api("/context", {
      method: "POST",
      body: { item: { context_type: contextForm.key.trim(), name: contextForm.value.trim(), description: null } },
    });
    contextForm.key = "";
    contextForm.value = "";
    await Promise.all([loadContext(), loadSummary()]);
    setInfo("Элемент контекста добавлен");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось добавить элемент контекста");
  } finally {
    busy.contextAction = false;
  }
}

async function clearContext() {
  if (!window.confirm("Удалить все элементы контекста компании?")) return;
  busy.contextAction = true;
  try {
    await api("/context?all=1", { method: "DELETE" });
    await Promise.all([loadContext(), loadSummary()]);
    setInfo("Контекст очищен");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось очистить контекст");
  } finally {
    busy.contextAction = false;
  }
}

async function removeContextItem(id) {
  const rowId = Number(id);
  if (!rowId) return;
  busy.contextAction = true;
  try {
    await api(`/context/${rowId}`, { method: "DELETE" });
    await Promise.all([loadContext(), loadSummary()]);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Не удалось удалить элемент контекста");
  } finally {
    busy.contextAction = false;
  }
}

function goToGenerateTab() {
  activeTab.value = "generate";
}

function saveToken() {
  try {
    window.localStorage.setItem("katet.seo.token", seoToken.value);
    setInfo("SEO токен сохранён в браузере для этого Directus UI");
  } catch {
    setError("Не удалось сохранить SEO токен в localStorage");
  }
}

async function ensureTabLoaded(tabId) {
  if (tabId === "overview" && !loadedTabs.overview) {
    await Promise.all([loadSummary(), loadJobs()]);
    loadedTabs.overview = true;
    return;
  }
  if (tabId === "queries" && !loadedTabs.queries) {
    await Promise.all([loadQueries(), loadClusterTargets()]);
    loadedTabs.queries = true;
    return;
  }
  if (tabId === "clusters" && !loadedTabs.clusters) {
    await Promise.all([loadSemanticsClusters(), loadSiteIndex()]);
    loadedTabs.clusters = true;
    return;
  }
  if (tabId === "generate" && !loadedTabs.generate) {
    await Promise.all([loadGeneratableClusters(), loadArticles()]);
    loadedTabs.generate = true;
    return;
  }
  if (tabId === "blog" && !loadedTabs.blog) {
    await loadPosts();
    loadedTabs.blog = true;
    return;
  }
  if (tabId === "context" && !loadedTabs.context) {
    await loadContext();
    loadedTabs.context = true;
    return;
  }
  if (tabId === "jobs" && !loadedTabs.jobs) {
    await loadJobs();
    loadedTabs.jobs = true;
  }
}

watch(activeTab, (tabId) => {
  void ensureTabLoaded(tabId);
});

watch(articleStatus, () => {
  if (activeTab.value === "generate") void loadArticles();
});

onMounted(async () => {
  try {
    seoToken.value = window.localStorage.getItem("katet.seo.token") || "";
  } catch {
    seoToken.value = "";
  }
  await Promise.all([loadSummary(), loadJobs()]);
  loadedTabs.overview = true;
  loadedTabs.jobs = true;
});

onBeforeUnmount(() => {
  clearPolling();
});
</script>

<style scoped>
.content {
  padding: 0 32px 64px;
  max-width: 1180px;
}

.section-intro {
  margin: 0 0 16px;
  color: var(--theme--foreground-subdued);
  font-size: 14px;
}

.block {
  margin-bottom: 16px;
}

.header-icon {
  --v-button-background-color: var(--theme--primary-background);
  --v-button-color: var(--theme--primary);
}

.nav-badge {
  margin-left: auto;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--theme--primary);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.panel {
  display: grid;
  gap: 16px;
}

.stats-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  text-align: left;
  border: var(--theme--border-width) solid var(--theme--border-color-subdued);
  border-radius: var(--theme--border-radius);
  background: var(--theme--background-subdued);
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.stat-card:hover {
  border-color: var(--theme--primary);
  background: var(--theme--background-normal);
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
  color: var(--theme--foreground);
}

.stat-label {
  font-size: 12px;
  color: var(--theme--foreground-subdued);
}

.card-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.card {
  border: var(--theme--border-width) solid var(--theme--border-color-subdued);
  border-radius: var(--theme--border-radius);
  background: var(--theme--background-subdued);
  padding: 18px;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--theme--foreground);
}

.card-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.card-head--between {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.muted {
  color: var(--theme--foreground-subdued);
}

.small {
  font-size: 12px;
}

.strong {
  font-weight: 600;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.row.tight {
  gap: 6px;
  margin-top: 8px;
}

.spacer {
  flex: 1 1 auto;
}

.form-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  margin-top: 12px;
}

.form-row--between {
  justify-content: space-between;
}

.form-grid {
  display: grid;
  gap: 12px;
  margin: 12px 0;
}

.field {
  display: grid;
  gap: 6px;
}

.field-wide {
  grid-column: 1 / -1;
}

.field-label {
  font-size: 12px;
  color: var(--theme--foreground-subdued);
}

.field-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--theme--foreground-subdued);
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}

.control {
  border: var(--theme--border-width) solid var(--theme--border-color);
  border-radius: var(--theme--border-radius);
  padding: 8px 11px;
  background: var(--theme--background);
  color: var(--theme--foreground);
  font: inherit;
  font-size: 13px;
  min-height: 36px;
}

.control::placeholder {
  color: var(--theme--foreground-subdued);
}

.control:focus {
  border-color: var(--theme--primary);
  outline: none;
}

.control-grow {
  flex: 1 1 220px;
  min-width: 180px;
}

.control-sm {
  width: 84px;
}

.control-area {
  width: 100%;
  resize: vertical;
  font-family: var(--theme--fonts--monospace--font-family, monospace);
}

.selection-bar {
  margin: 12px 0;
  padding: 12px;
  border: 1px dashed var(--theme--primary);
  border-radius: var(--theme--border-radius);
  background: var(--theme--primary-background);
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.progress {
  margin-top: 12px;
}

.table-scroll {
  overflow-x: auto;
  margin-top: 4px;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  border-bottom: var(--theme--border-width) solid var(--theme--border-color-subdued);
  padding: 9px 10px;
  text-align: left;
  vertical-align: top;
  font-size: 13px;
}

.table th {
  color: var(--theme--foreground-subdued);
  font-weight: 600;
  white-space: nowrap;
}

.check-col {
  width: 34px;
  text-align: center;
}

.num {
  white-space: nowrap;
}

.cell-main {
  font-weight: 600;
  color: var(--theme--foreground);
}

.cell-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--theme--foreground-subdued);
}

.row-selected {
  background: var(--theme--primary-background);
}

.action-cell {
  width: 110px;
  text-align: right;
}

.pagination {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.badge-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.badge-row.tight {
  gap: 5px;
}

.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 12px;
  line-height: 1.3;
  border: 1px solid transparent;
  white-space: nowrap;
}

.badge--blue {
  color: var(--theme--foreground);
  background: var(--theme--background-normal);
  border-color: var(--theme--border-color);
}

.badge--green {
  color: var(--theme--success, #0f7a4a);
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.4);
}

.badge--amber {
  color: var(--theme--warning, #9a6a00);
  background: rgba(245, 158, 11, 0.14);
  border-color: rgba(245, 158, 11, 0.4);
}

.badge--red {
  color: var(--theme--danger, #b02a37);
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.4);
}

.badge--gray {
  color: var(--theme--foreground-subdued);
  background: var(--theme--background-normal);
  border-color: var(--theme--border-color-subdued);
}

.chip-filter {
  border: var(--theme--border-width) solid var(--theme--border-color-subdued);
  background: var(--theme--background);
  color: var(--theme--foreground);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
}

.chip-filter--active {
  border-color: var(--theme--foreground-subdued);
  color: var(--theme--foreground);
  background: var(--theme--background-normal);
}

.chip-green {
  --v-chip-color: var(--theme--success, #0f7a4a);
  --v-chip-background-color: rgba(16, 185, 129, 0.12);
}

.chip-amber {
  --v-chip-color: var(--theme--warning, #9a6a00);
  --v-chip-background-color: rgba(245, 158, 11, 0.14);
}

.empty-state {
  margin-top: 12px;
  padding: 14px;
  border: var(--theme--border-width) dashed var(--theme--border-color-subdued);
  border-radius: var(--theme--border-radius);
  background: var(--theme--background);
  color: var(--theme--foreground-subdued);
  display: grid;
  gap: 6px;
  justify-items: start;
}

.empty-state--compact {
  padding: 10px 12px;
}

.empty-title {
  margin: 0;
  color: var(--theme--foreground);
  font-size: 13px;
  font-weight: 600;
}

.empty-text {
  margin: 0;
  font-size: 12px;
}

.index-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.index-grid > div {
  border: var(--theme--border-width) solid var(--theme--border-color-subdued);
  border-radius: var(--theme--border-radius);
  padding: 10px;
  display: grid;
  gap: 4px;
  background: var(--theme--background);
}

.index-grid strong {
  font-size: 18px;
}

.actions-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.related-list {
  margin-top: 6px;
  display: grid;
  gap: 6px;
}

.related-item {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.keywords-box {
  margin-top: 8px;
  border: var(--theme--border-width) solid var(--theme--border-color-subdued);
  border-radius: var(--theme--border-radius);
  padding: 10px;
  background: var(--theme--background);
}

.keywords-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.keywords-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.log-box {
  margin-top: 12px;
  border: var(--theme--border-width) solid var(--theme--border-color-subdued);
  border-radius: var(--theme--border-radius);
  padding: 10px;
  font-size: 12px;
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
  background: var(--theme--background);
}

.results-list {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: var(--theme--border-width) solid var(--theme--border-color-subdued);
  border-radius: var(--theme--border-radius);
  padding: 10px;
  background: var(--theme--background);
}

.editor-card {
  border-color: var(--theme--primary);
}

.editor-card .field-wide textarea {
  min-height: 280px;
}

.job-log {
  margin-top: 16px;
  border-top: var(--theme--border-width) solid var(--theme--border-color-subdued);
  padding-top: 12px;
}

.job-log h4 {
  margin: 0 0 8px;
  font-size: 14px;
}

.job-log ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.job-log li {
  display: grid;
  grid-template-columns: 180px 170px 1fr;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
}

@media (max-width: 960px) {
  .content {
    padding: 0 20px 48px;
  }

  .table th,
  .table td {
    padding: 8px;
  }

  .action-cell {
    width: auto;
    text-align: left;
  }
}

@media (max-width: 720px) {
  .content {
    padding: 0 12px 32px;
  }

  .stats-grid,
  .card-grid {
    grid-template-columns: 1fr;
  }

  .control,
  .control-grow,
  .control-sm {
    width: 100%;
  }

  .toolbar,
  .selection-bar,
  .actions-inline,
  .row,
  .form-row {
    align-items: stretch;
  }

  .result-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .job-log li {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}

.link {
  color: var(--theme--foreground-subdued);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.link:visited {
  color: var(--theme--foreground-subdued);
}

.link:hover {
  color: var(--theme--foreground);
  text-decoration: none;
}
</style>
