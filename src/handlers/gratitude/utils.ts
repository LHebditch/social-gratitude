export const formattedDate = (d: Date = new Date()) => {
    const day = d.getDate()
    const month = d.getMonth() + 1
    const year = d.getFullYear()

    return `${year}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day}`
}