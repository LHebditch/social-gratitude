export const formattedDate = () => {
    const day = new Date().getDate()
    const month = new Date().getMonth()
    const year = new Date().getFullYear()

    return `${year}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day}`
}