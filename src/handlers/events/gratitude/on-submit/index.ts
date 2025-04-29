import { DynamoDBStreamHandler } from "aws-lambda";
import { Entry } from "../../../../lib/models/journal";

import { AttributeValue, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchGetCommand, BatchWriteCommand, DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { formattedDate } from "../../../gratitude/utils";
import { MisconfiguredServiceError } from "../../../../lib/exceptions";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());

export const handler: DynamoDBStreamHandler = async (ev) => {
    // we only care about inserted items
    const records = ev.Records
        .filter(e => e.eventName === "INSERT")
        .map(e => unmarshall(e.dynamodb.NewImage as Record<string, AttributeValue>)) as Entry[];

    console.info(`updating streaks for ${records.length} users`)
    const users: string[] = []
    for (let r of records) {
        const [_, user] = r._pk.split('/')
        if (users.indexOf(user) == -1) {
            users.push(user)
        }
    }

    try {
        await updateStreaks(users)
    } catch (e: unknown) {
        if (e instanceof Error) {
            console.error(e)
        }
        console.error('Something strange is afoot...', e)
    }

}

export type Streak = {
    _pk: string // userid
    _sk: string // STREAK

    streakStartDate: string
    streakEndDate: string

    maxStreak: number
    currentStreak: number
}

const updateStreaks = async (users: string[]): Promise<void> => {
    const today = formattedDate()
    const yesterday = formattedDate(new Date(Date.now() - (24 * 60 * 60 * 1000)))
    const streaks = await getStreaks(users)

    const existingUsers = []

    for (let streak of streaks) {
        if (streak.streakEndDate === today || streak.streakEndDate === yesterday) {
            console.info('resetting streak for user: ', streak._pk)
            streak.streakEndDate = today
        } else {
            console.info('incrementing streak for user: ', streak._pk)
            streak.maxStreak = Math.max(streak.currentStreak, streak.maxStreak)
            streak.streakStartDate = today
            streak.streakEndDate = today
        }

        streak.currentStreak = getStreak(streak.streakStartDate, streak.streakEndDate)
        existingUsers.push(streak._pk)
    }

    if (users.length !== existingUsers.length) {
        for (let u of users) {
            console.info('initializing streak for user: ', u)
            if (existingUsers.includes(u)) {
                continue
            }

            streaks.push({
                _pk: u,
                _sk: 'STREAK',
                currentStreak: 1,
                maxStreak: 1,
                streakEndDate: today,
                streakStartDate: today,
            })
        }
    }

    console.info('saving streaks')
    await saveToDynamo(streaks)

}

const getStreak = (start: string, end: string): number => {
    const streakMS = (new Date(end).getTime() - new Date(start).getTime())
    const streak = streakMS / 1000 / 60 / 60 / 24
    return streak + 1 // the first day, instead of being 0 should be 1
}

const getStreaks = async (users: string[]): Promise<Streak[]> => {
    if (!process.env.GRATITUDE_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    const keys = users.map((u) => ({
        _pk: u,
        _sk: 'STREAK',
    }))

    const cmd = new BatchGetCommand({
        RequestItems: {
            [process.env.GRATITUDE_TABLE_NAME]: {
                Keys: keys,
            }
        }
    })


    const res = await dynamo.send(cmd)
    if (res.UnprocessedKeys != null && Object.keys(res.UnprocessedKeys).length > 0) {
        console.error('not all entries were requested...', res)
        // handle retry...but UnprocessedKeys is being incredibly annoying
    }
    console.debug('returning results from dynamo')
    return res.Responses[process.env.GRATITUDE_TABLE_NAME] as Streak[]
}

const saveToDynamo = async (streaks: Streak[]) => {
    if (!process.env.GRATITUDE_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    // batch get the existing streaks

    const putCommand = new BatchWriteCommand({
        RequestItems: {
            [process.env.GRATITUDE_TABLE_NAME]: streaks.map(s => ({
                PutRequest: {
                    Item: s,
                }
            }))
        }
    })
    await dynamo.send(putCommand)
}
