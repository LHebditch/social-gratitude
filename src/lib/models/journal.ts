export type Entries = {
    id?: string
    entry1: string
    entry2: string
    entry3: string
}

export type Entry = {
    id?: string
    entry: string
    index: number
    gsi1: string
    _sk: string
    _pk: string
}

export type EntryLike = {
    _pk: string
    _sk: string

    creatorId: string
    id: string
    index: number
    likedById: string
    value: number

    _ttl?: number
    gsi1?: string
}