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
  version: "1.0.0",
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

// 核心函数：从 TMDB 获取指定平台的热门内容
async function fetchNetworkTop4(networkId, networkName) {
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

    const results = response.results.slice(0, 4); // 只取前 4 个

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


// 混合显示所有平台
async function loadAllNetworksTop4(params = {}) {
    const [netflixItems, appleTVItems, hboMaxItems] = await Promise.all([
        fetchNetworkTop4(213, "Netflix"),
        fetchNetworkTop4(2552, "Apple TV+"),
        fetchNetworkTop4(3186, "HBO Max")
    ]);

    const mixed = [];
    const maxLength = Math.max(netflixItems.length, appleTVItems.length, hboMaxItems.length);

    for (let i = 0; i < maxLength; i++) {
        if (netflixItems[i]) mixed.push(netflixItems[i]);
        if (appleTVItems[i]) mixed.push(appleTVItems[i]);
        if (hboMaxItems[i]) mixed.push(hboMaxItems[i]);
    }

    console.log(`mixed ${mixed.map(item => JSON.stringify(item)).join(',')}`);
    return mixed;
}
