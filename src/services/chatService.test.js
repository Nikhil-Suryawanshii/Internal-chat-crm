import API from "../config/api";
import ChatService from "./chatService";

describe("ChatService group creation", () => {
    it("sends the correct payload to create a group", async () => {
        const postSpy = jest.spyOn(API, "post").mockResolvedValue({
            data: { success: true }
        });

        await ChatService.createGroup(
            101,
            "Team Alpha",
            [102, 103],
            5
        );

        expect(postSpy).toHaveBeenCalledWith("/chat/group/create", {
            sender_id: 101,
            group_name: "Team Alpha",
            member_ids: [102, 103],
            org_id: 5,
        });

        postSpy.mockRestore();
    });
});
