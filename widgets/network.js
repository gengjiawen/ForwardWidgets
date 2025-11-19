// =============UserScript=============
// @name         流媒体平台热门榜单
// @version      1.0.0
// @description  Netflix、Apple TV+、HBO、爱优腾 热门剧集榜单
// @author       gengjiawen
// =============UserScript=============

WidgetMetadata = {
  id: "forward.streaming.networks",
  title: "流媒体热榜",
  description: "Netflix、Apple TV+、HBO、爱优腾 热门剧集",
  author: "gengjiawen",
  cacheDuration: 3600,
  version: "2025.11.19",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "国际平台热门榜单",
      description: "Netflix、Apple TV+、HBO 热门剧集",
      requiresWebView: false,
      functionName: "loadAllNetworksTop4",
      cacheDuration: 3600,
      params: []
    },
    {
      title: "国内平台热门榜单",
      description: "爱奇艺、优酷、腾讯视频 热门剧集",
      requiresWebView: false,
      functionName: "loadChinaNetworksTop4",
      cacheDuration: 3600,
      params: []
    }
  ]
};

// 辅助函数：获取 TMDB 类型标题
let tmdbGenresCache = null;

async function fetchTmdbGenres() {
    if (tmdbGenresCache) return tmdbGenresCache;

    const [movieGenres, tvGenres] = await Promise.all([
        Widget.tmdb.get('/genre/movie/list', { params: { language: 'zh-CN' } }),
        Widget.tmdb.get('/genre/tv/list', { params: { language: 'zh-CN' } })
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

// 核心函数：从 TMDB 获取指定平台的热门内容
async function fetchNetworkTop(networkId, networkName) {
    await fetchTmdbGenres();

    const response = await Widget.tmdb.get('/discover/tv', {
        params: {
            language: 'zh-CN',
            with_networks: networkId,
            sort_by: 'popularity.desc',
            page: 1,
            'vote_count.gte': 50 // 至少 50 个投票，过滤掉不知名内容
        }
    });

    // 取前 15 个
    const results = response.results.slice(0, 15);

    // 过滤基本数据
    const filteredResults = results.filter(item =>
        item.poster_path && item.id && item.name && item.name.trim().length > 0
    );

    // 为每个剧集获取 keywords
    const itemsWithKeywords = await Promise.all(
        filteredResults.map(async (item) => {
            const genreIds = item.genre_ids || [];
            const genreTitle = getTmdbGenreTitles(genreIds, 'tv');

            // 获取 keywords
            let keywords = [];
            try {
                const keywordsResponse = await Widget.tmdb.get(`/tv/${item.id}/keywords`);
                keywords = keywordsResponse.results || [];
            } catch (error) {
                console.log(`Failed to fetch keywords for TV ${item.id}: ${error}`);
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
                keywords: keywords.map(kw => kw.name).join('•') // 关键词用 • 分隔
            };
        })
    );

    return itemsWithKeywords;
}


async function loadAllNetworksTop4() {
    const [appleTVTop10, netflixTop10, hboTop10] = await Promise.all([
        fetchNetworkTop(2552, "Apple TV+"),
        fetchNetworkTop(213, "Netflix"),
        fetchNetworkTop(49, "HBO")
    ]);

    // 从每个平台的最热门15个中随机选择 4 个
    const appleTVItems = getRandomItems(appleTVTop10, 4);
    const netflixItems = getRandomItems(netflixTop10, 4);
    const hboItems = getRandomItems(hboTop10, 4);

    // 交替混合显示：Apple TV+, Netflix, HBO, Apple TV+, Netflix, HBO...
    const mixed = [];
    const maxLength = Math.max(appleTVItems.length, netflixItems.length, hboItems.length);

    for (let i = 0; i < maxLength; i++) {
        if (appleTVItems[i]) mixed.push(appleTVItems[i]);
        if (netflixItems[i]) mixed.push(netflixItems[i]);
        if (hboItems[i]) mixed.push(hboItems[i]);
    }

    console.log(`international mixed ${mixed.map(item => JSON.stringify(item, null, 2)).join('\n')}`);
    return mixed;
}

// 国内平台混合榜单（爱优腾）
async function loadChinaNetworksTop4() {
    const [iqiyiTop15, youkuTop15, tencentTop15] = await Promise.all([
        fetchNetworkTop(1330, "爱奇艺"),
        fetchNetworkTop(1419, "优酷"),
        fetchNetworkTop(2007, "腾讯视频")
    ]);

    // 从每个平台的最热门15个中随机选择 4 个
    const iqiyiItems = getRandomItems(iqiyiTop15, 4);
    const youkuItems = getRandomItems(youkuTop15, 4);
    const tencentItems = getRandomItems(tencentTop15, 4);

    // 交替混合显示：爱奇艺, 优酷, 腾讯视频, 爱奇艺, 优酷, 腾讯视频...
    const mixed = [];
    const maxLength = Math.max(iqiyiItems.length, youkuItems.length, tencentItems.length);

    for (let i = 0; i < maxLength; i++) {
        if (iqiyiItems[i]) mixed.push(iqiyiItems[i]);
        if (youkuItems[i]) mixed.push(youkuItems[i]);
        if (tencentItems[i]) mixed.push(tencentItems[i]);
    }

    console.log(`china mixed ${mixed.map(item => JSON.stringify(item, null, 2)).join('\n')}`);
    return mixed;
}
