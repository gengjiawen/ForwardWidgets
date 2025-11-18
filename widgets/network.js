// =============UserScript=============
// @name         流媒体平台热门榜单
// @version      1.0.0
// @description  Netflix、Apple TV+、HBO Max 热门剧集榜单
// @author       gengjiawen
// =============UserScript=============

WidgetMetadata = {
  id: "forward.streaming.networks",
  title: "流媒体热榜",
  description: "Netflix、Apple TV+、HBO Max 热门剧集",
  author: "gengjiawen",
  version: "2025.11.18",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "平台热门榜单",
      description: "Netflix、Apple TV+、HBO Max 各 4 部混合显示",
      requiresWebView: false,
      functionName: "loadAllNetworksTop4",
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

// 核心函数：从 TMDB 获取指定平台的热门内容（取前10个）
async function fetchNetworkTop10(networkId, networkName) {
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

    const results = response.results.slice(0, 10); // 取前 10 个

    return results
        .filter(item => item.poster_path && item.id && item.name && item.name.trim().length > 0)
        .map(item => {
            const genreIds = item.genre_ids || [];
            const genreTitle = getTmdbGenreTitles(genreIds, 'tv');

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
                networkName: networkName
            };
        });
}


// 混合显示所有平台（每个平台从前10随机选4个）
async function loadAllNetworksTop4() {
    // 获取每个平台的前 10 个热门剧集
    const [appleTVTop10, netflixTop10, hboMaxTop10] = await Promise.all([
        fetchNetworkTop10(2552, "Apple TV+"),
        fetchNetworkTop10(213, "Netflix"),
        fetchNetworkTop10(3186, "HBO Max")
    ]);

    // 从每个平台的 10 个中随机选择 4 个
    const appleTVItems = getRandomItems(appleTVTop10, 4);
    const netflixItems = getRandomItems(netflixTop10, 4);
    const hboMaxItems = getRandomItems(hboMaxTop10, 4);

    // 交替混合显示：Apple TV+, Netflix, HBO Max, Apple TV+, Netflix, HBO Max...
    const mixed = [];
    const maxLength = Math.max(appleTVItems.length, netflixItems.length, hboMaxItems.length);

    for (let i = 0; i < maxLength; i++) {
        if (appleTVItems[i]) mixed.push(appleTVItems[i]);
        if (netflixItems[i]) mixed.push(netflixItems[i]);
        if (hboMaxItems[i]) mixed.push(hboMaxItems[i]);
    }

    console.log(`mixed ${mixed.map(item => JSON.stringify(item, null, 2)).join('\n')}`);
    return mixed;
}
