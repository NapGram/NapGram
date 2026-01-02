export default {
    pagination(arr, pageSize, currentPage) {
        const skipNum = currentPage * pageSize;
        return (skipNum + pageSize >= arr.length) ? arr.slice(skipNum, arr.length) : arr.slice(skipNum, skipNum + pageSize);
    },
};
