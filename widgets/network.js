// =============UserScript=============
// @name         流媒体平台热门榜单
// @version      2026.06.05
// @description  Netflix、Apple TV+、HBO、爱优腾 热门剧集榜单
// @author       gengjiawen
// =============UserScript=============

WidgetMetadata = {
  id: "forward.streaming.networks",
  title: "流媒体热榜",
  description: "Netflix、Apple TV+、HBO、爱优腾 热门剧集",
  author: "gengjiawen",
  cacheDuration: 3600,
  version: "2026.06.05",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "国际平台热门榜单",
      description: "Netflix、Apple TV+、HBO 近半年热门剧集 + IMDb 随机补充",
      requiresWebView: false,
      functionName: "loadAllNetworksTop3WithImdb",
      cacheDuration: 3600,
      params: []
    },
    {
      title: "国内平台热门榜单",
      description: "爱奇艺、优酷、腾讯视频 近半年热门剧集 + IMDb 随机补充",
      requiresWebView: false,
      functionName: "loadChinaNetworksTop3WithImdb",
      cacheDuration: 3600,
      params: []
    }
  ]
};

const TOTAL_ITEMS = 12;
const NETWORK_HOT_ITEMS = 3;
const RECENT_MONTHS = 6;
const IMDB_TOP_TV_URL = "https://raw.githubusercontent.com/gengjiawen/ForwardWidgets/refs/heads/main/widgets/imdb_top250_tv.json";

// 辅助函数：获取 TMDB 类型标题
let tmdbGenresCache = null;
let keywordsCache = {}; 
let imdbTvCache = null;

async function fetchTmdbGenres() {
    if (tmdbGenresCache) return tmdbGenresCache;

    const [movieGenres, tvGenres] = await Promise.all([
        Widget.tmdb.get('genre/movie/list', { params: { language: 'zh-CN' } }),
        Widget.tmdb.get('genre/tv/list', { params: { language: 'zh-CN' } })
    ]);

    tmdbGenresCache = {
        movie: movieGenres.genres.reduce((acc, g) => ({ ...acc, [g.id]: g.name }), {}),
        tv: tvGenres.genres.reduce((acc, g) => ({ ...acc, [g.id]: g.name }), {})
    };
    return tmdbGenresCache;
}

function getTmdbGenreTitles(genreIds, mediaType) {
    const genres = tmdbGenresCache?.[mediaType] || {};
    const topThreeIds = genreIds.slice(0, 3);
    return topThreeIds
        .map(id => genres[id]?.trim() || `未知类型(${id})`)
        .filter(Boolean)
        .join('•');
}

// 随机选择数组中的 n 个元素
function getRandomItems(array, count) {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getRecentDateRange(months) {
    const today = new Date();
    const start = new Date(today);
    start.setMonth(start.getMonth() - months);

    return {
        startDate: formatDate(start),
        endDate: formatDate(today)
    };
}

function isRecentRelease(dateString, startDate, endDate) {
    return Boolean(dateString && dateString >= startDate && dateString <= endDate);
}

function dedupeById(items) {
    const seen = {};
    return items.filter((item) => {
        const key = `${item.type}:${item.id}`;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
}

function hasHorrorKeyword(item) {
    const keywords = (item.keywords || '').toLowerCase();
    const genreTitle = (item.genreTitle || '').toLowerCase();
    return keywords.includes('horror') || genreTitle.includes('恐怖') || genreTitle.includes('horror');
}

async function fetchImdbTvItems() {
    if (imdbTvCache) return imdbTvCache;

    const response = await Widget.http.get(IMDB_TOP_TV_URL);
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    imdbTvCache = Array.isArray(data) ? data : [];
    return imdbTvCache;
}

async function fillWithRandomImdbTv(items, totalCount) {
    if (items.length >= totalCount) return items.slice(0, totalCount);

    const existingTitles = {};
    items.forEach((item) => {
        existingTitles[String(item.title || '').toLowerCase()] = true;
    });

    const imdbItems = await fetchImdbTvItems();
    const candidates = imdbItems.filter((item) => !existingTitles[String(item.title || '').toLowerCase()]);
    return items.concat(getRandomItems(candidates, totalCount - items.length));
}

// 核心函数：从 TMDB 获取指定平台的热门内容
async function fetchNetworkTop(networkId, networkName) {
    await fetchTmdbGenres();
    const { startDate, endDate } = getRecentDateRange(RECENT_MONTHS);
    const pages = [1, 2, 3];

    const responses = await Promise.all(
        pages.map(page => Widget.tmdb.get('discover/tv', {
            params: {
                language: 'zh-CN',
                with_networks: networkId,
                sort_by: 'popularity.desc',
                page: page,
                'first_air_date.gte': startDate,
                'first_air_date.lte': endDate,
                'vote_count.gte': 50 // 至少 50 个投票，过滤掉不知名内容
            }
        }))
    );

    const results = responses
        .flatMap(response => response.results || [])
        .filter(item => isRecentRelease(item.first_air_date, startDate, endDate))
        .slice(0, 20);

    // 过滤基本数据
    const filteredResults = results.filter(item =>
        item.poster_path && item.id && item.name && item.name.trim().length > 0
    );

    // 为每个剧集获取 keywords
    const itemsWithKeywords = await Promise.all(
        filteredResults.map(async (item) => {
            const genreIds = item.genre_ids || [];
            const genreTitle = getTmdbGenreTitles(genreIds, 'tv');

            // 获取 keywords（从缓存或 API）
            let keywords = [];
            if (keywordsCache[item.id]) {
                keywords = keywordsCache[item.id];
            } else {
                try {
                    const keywordsResponse = await Widget.tmdb.get(`tv/${item.id}/keywords`);
                    keywords = keywordsResponse.results || [];
                    keywordsCache[item.id] = keywords;
                } catch (error) {
                    console.log(`Failed to fetch keywords for TV ${item.id}: ${error}`);
                }
            }

            return {
                id: String(item.id),
                type: "tmdb",
                title: item.name,
                description: item.overview || `${networkName} 热门剧集`,
                releaseDate: item.first_air_date,
                backdropPath: item.backdrop_path,
                posterPath: item.poster_path,
                rating: item.vote_average ? item.vote_average.toFixed(1) : "0",
                mediaType: "tv",
                genreTitle: genreTitle || networkName,
                networkName: networkName,
                popularity: item.popularity || 0,
                keywords: keywords.map(kw => kw.name).join('•') 
            };
        })
    );

    return itemsWithKeywords;
}

async function loadNetworkTop3WithImdb(networks, options = {}) {
    const networkLists = await Promise.all(
        networks.map(network => fetchNetworkTop(network.id, network.name))
    );

    let hotItems = dedupeById(networkLists.flat())
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

    if (options.filterHorror) {
        hotItems = hotItems.filter(item => {
            const hasHorror = hasHorrorKeyword(item);
            if (hasHorror) {
                console.log(`Filtered out horror content: ${item.title}`);
            }
            return !hasHorror;
        });
    }

    const networkItems = hotItems.slice(0, NETWORK_HOT_ITEMS);
    const mixed = await fillWithRandomImdbTv(networkItems, TOTAL_ITEMS);

    console.log(`${options.logPrefix || 'network'} mixed ${mixed.map(item => JSON.stringify(item, null, 2)).join('\n')}`);
    return mixed;
}

async function loadAllNetworksTop3WithImdb() {
    return await loadNetworkTop3WithImdb([
        { id: 2552, name: "Apple TV+" },
        { id: 213, name: "Netflix" },
        { id: 49, name: "HBO" }
    ], { filterHorror: true, logPrefix: "international" });
}

// 国内平台混合榜单（爱优腾）
async function loadChinaNetworksTop3WithImdb() {
    return await loadNetworkTop3WithImdb([
        { id: 1330, name: "爱奇艺" },
        { id: 1419, name: "优酷" },
        { id: 2007, name: "腾讯视频" }
    ], { logPrefix: "china" });
}
