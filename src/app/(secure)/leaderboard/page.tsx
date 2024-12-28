const Leaderboard = () => {
    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-center mb-8 text-foreground">Top Performing Agents</h1>
            
            <div className="bg-content1 rounded-xl shadow-medium overflow-hidden border border-content3">
                {/* Header */}
                <div className="bg-content2 px-6 py-4 border-b border-content3 grid grid-cols-12 gap-4">
                    <div className="col-span-1 font-semibold text-foreground">Rank</div>
                    <div className="col-span-3 font-semibold text-foreground">Agent</div>
                    <div className="col-span-3 font-semibold text-foreground">Sales Volume</div>
                    <div className="col-span-3 font-semibold text-foreground">Deals Closed</div>
                    <div className="col-span-2 font-semibold text-foreground">Success Rate</div>
                </div>

                {/* Rows */}
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rank) => (
                    <div 
                        key={rank}
                        className={`px-6 py-4 grid grid-cols-12 gap-4 border-b border-content3 hover:bg-content2 transition-colors
                            ${rank === 1 ? 'bg-warning-50' : ''} 
                            ${rank === 2 ? 'bg-content2' : ''} 
                            ${rank === 3 ? 'bg-danger-50' : ''}`}
                    >
                        <div className="col-span-1 font-medium">
                            {rank <= 3 ? (
                                <span className={`
                                    inline-flex items-center justify-center w-8 h-8 rounded-full font-bold
                                    ${rank === 1 ? 'bg-warning text-warning-foreground' : ''}
                                    ${rank === 2 ? 'bg-content3 text-foreground' : ''}
                                    ${rank === 3 ? 'bg-danger text-danger-foreground' : ''}
                                `}>
                                    {rank}
                                </span>
                            ) : (
                                <span className="text-foreground-500">{rank}</span>
                            )}
                        </div>
                        <div className="col-span-3 flex items-center gap-3">
                            <div className="w-10 h-10 bg-content3 rounded-full"></div>
                            <span className="text-foreground font-medium">Agent Name</span>
                        </div>
                        <div className="col-span-3 text-success font-medium">$1,234,567</div>
                        <div className="col-span-3 text-foreground-600">123</div>
                        <div className="col-span-2 text-primary font-medium">95%</div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default Leaderboard;